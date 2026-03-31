import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { removeClaudeLines } from './scanner.js';

export async function rewriteCommits(range, commits) {
  if (commits.length === 0) {
    return { success: true, rewrittenCount: 0 };
  }

  // Create a temporary script for the msg-filter
  const filterScript = createFilterScript();

  try {
    // Determine the base commit for rebasing
    const baseCommit = getBaseCommit(range);

    // Use git filter-branch with msg-filter
    // Windows shells (cmd/PowerShell) don't treat single quotes as grouping,
    // so use double quotes on Windows and single quotes elsewhere.
    const q = process.platform === 'win32' ? '"' : "'";
    const filterCommand = baseCommit
      ? `git filter-branch --force --msg-filter ${q}${filterScript}${q} ${baseCommit}..HEAD`
      : `git filter-branch --force --msg-filter ${q}${filterScript}${q} HEAD`;

    execSync(filterCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Clean up the backup refs created by filter-branch
    cleanupBackupRefs();

    return { success: true, rewrittenCount: commits.length };
  } catch (error) {
    // Try to abort/recover if something went wrong
    try {
      execSync('git filter-branch --abort', { stdio: 'ignore' });
    } catch {
      // Ignore abort errors
    }

    return {
      success: false,
      error: error.message || 'Failed to rewrite commits'
    };
  } finally {
    // Clean up temporary script
    cleanupFilterScript(filterScript);
  }
}

export function createFilterScript() {
  // Create a Node.js script that filters the commit message
  const scriptContent = `
const LINE_PATTERNS = [
  /^co-authored-by:.*claude.*/i,
  /^co-authored-by:.*@anthropic\\.com.*/i,
  /^.*Generated with \\[Claude Code\\].*/,
  /^.*Generated with Claude Code.*/,
  /^.*🤖.*Generated with.*Claude.*/
];

let message = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { message += chunk; });
process.stdin.on('end', () => {
  const lines = message.split('\\n');
  const filteredLines = lines.filter(line => {
    return !LINE_PATTERNS.some(pattern => pattern.test(line));
  });
  let result = filteredLines.join('\\n');
  result = result.replace(/\\n{3,}/g, '\\n\\n').trimEnd();
  process.stdout.write(result);
});
`;

  const scriptPath = join(tmpdir(), `de-claude-filter-${process.pid}.js`);
  writeFileSync(scriptPath, scriptContent, 'utf-8');
  chmodSync(scriptPath, '755');

  const posixPath = scriptPath.split(sep).join('/');
  return `node "${posixPath}"`;
}

export function cleanupFilterScript(filterCommand) {
  // Extract script path from command
  const match = filterCommand.match(/node "?(.+?)"?$/);
  if (match) {
    try {
      unlinkSync(match[1]);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function cleanupBackupRefs() {
  // Get list of backup refs created by filter-branch
  try {
    const refs = execSync('git for-each-ref --format="%(refname)" refs/original/', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    if (!refs) return;

    // Delete each ref individually (cross-platform compatible)
    for (const ref of refs.split('\n')) {
      if (ref) {
        try {
          execSync(`git update-ref -d ${ref}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } catch {
          // Ignore individual ref deletion errors
        }
      }
    }
  } catch {
    // Ignore errors - refs/original may not exist
  }
}

function getBaseCommit(range) {
  if (range === 'HEAD' || range === 'ROOT..HEAD') {
    // All commits - return null to indicate root
    return null;
  }

  const parts = range.split('..');
  if (parts.length === 2) {
    return parts[0];
  }

  return null;
}

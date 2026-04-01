import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export async function rewriteCommits(range, commits, { messageMap } = {}) {
  if (commits.length === 0) {
    return { success: true, rewrittenCount: 0 };
  }

  // Create a temporary script for the msg-filter
  const filterScript = createFilterScript(messageMap);

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

// Sed patterns matching LINE_PATTERNS from scanner.js
// Combined into a single sed command to avoid spawning multiple processes.
// Each pattern deletes matching lines in one pass.
const SED_DELETE_PATTERNS = [
  '/^[Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]:.*[Cc][Ll][Aa][Uu][Dd][Ee]/d',
  '/^[Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]:.*@[Aa][Nn][Tt][Hh][Rr][Oo][Pp][Ii][Cc]\\.[Cc][Oo][Mm]/d',
  '/Generated with \\[Claude Code\\]/d',
  '/Generated with Claude Code/d',
  '/🤖.*Generated with.*Claude/d',
];

function buildSedFilter() {
  // Build a single sed command that deletes all attribution lines and
  // collapses excessive blank lines, replacing the old grep chain + awk + sed
  // pipeline (7 processes) with a single process.
  const deleteExprs = SED_DELETE_PATTERNS.map(p => `-e '${p}'`).join(' ');
  return `sed ${deleteExprs}`;
}

export function createFilterScript(messageMap) {
  const hasMap = messageMap && messageMap.size > 0;
  const sedFilter = buildSedFilter();

  // Blank-line cleanup: remove trailing blank lines from the message.
  // The N;ba loop accumulates trailing blank lines and $d deletes them at EOF.
  const cleanupSed = `sed -e :a -e '/^\\n*$/{$d;N;ba' -e '}'`;

  if (!hasMap) {
    // Strip-only: sed filter + cleanup (2 processes total vs 7 in the old grep chain)
    const scriptContent = `#!/bin/sh
${sedFilter} | ${cleanupSed}
`;
    const scriptPath = join(tmpdir(), `de-claude-filter-${process.pid}.sh`);
    writeFileSync(scriptPath, scriptContent, 'utf-8');
    chmodSync(scriptPath, '755');
    return scriptPath.replace(/\\/g, '/');
  }

  // Interactive path: embed message map as cksum-keyed lookup in shell script
  const mapEntries = [];
  for (const [original, replacement] of messageMap) {
    const trimmed = original.trim();
    const cksum = computeCksum(trimmed);
    const escapedReplacement = replacement.replace(/'/g, "'\\''");
    mapEntries.push({ cksum, replacement: escapedReplacement });
  }

  const caseEntries = mapEntries
    .map(({ cksum, replacement }) => `    ${cksum}) printf '%s' '${replacement}' ; exit 0 ;;`)
    .join('\n');

  const scriptContent = `#!/bin/sh
MSG=$(cat)
HASH=$(printf '%s' "$MSG" | cksum | cut -d' ' -f1)
case "$HASH" in
${caseEntries}
esac
printf '%s' "$MSG" | ${sedFilter} | ${cleanupSed}
`;

  const scriptPath = join(tmpdir(), `de-claude-filter-${process.pid}.sh`);
  writeFileSync(scriptPath, scriptContent, 'utf-8');
  chmodSync(scriptPath, '755');
  return scriptPath.replace(/\\/g, '/');
}

function computeCksum(text) {
  // Use Node's execSync to get the same cksum the shell script will compute
  const result = execSync(`printf '%s' ${shellQuote(text)} | cksum | cut -d' ' -f1`, {
    encoding: 'utf-8',
    shell: 'bash',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return result.trim();
}

function shellQuote(s) {
  // Safely quote a string for shell by wrapping in single quotes
  // and escaping embedded single quotes
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function cleanupFilterScript(filterCommand) {
  // The filterCommand is now just a path to a .sh file
  try {
    unlinkSync(filterCommand);
  } catch {
    // Ignore cleanup errors
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

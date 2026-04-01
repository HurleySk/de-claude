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

// Shell-based grep patterns matching LINE_PATTERNS from scanner.js
// Using grep -v with extended regex to filter out attribution lines.
// Each pattern is case-insensitive where needed.
const GREP_STRIP_PATTERNS = [
  { pattern: '^[Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]:.*[Cc][Ll][Aa][Uu][Dd][Ee]', flags: '' },
  { pattern: '^[Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]:.*@[Aa][Nn][Tt][Hh][Rr][Oo][Pp][Ii][Cc]\\.[Cc][Oo][Mm]', flags: '' },
  { pattern: 'Generated with \\[Claude Code\\]', flags: '' },
  { pattern: 'Generated with Claude Code', flags: '' },
  { pattern: '🤖.*Generated with.*Claude', flags: '' },
];

function buildGrepChain() {
  // Build a chain of grep -v commands to strip attribution lines.
  // Each grep -v removes lines matching that pattern. We use character
  // classes for case-insensitivity instead of -i to keep it portable.
  // grep -v exits 1 when no lines pass through, so we use "|| true" per stage.
  return GREP_STRIP_PATTERNS
    .map(({ pattern }) => `(grep -v '${pattern}' || true)`)
    .join(' | ');
}

export function createFilterScript(messageMap) {
  const hasMap = messageMap && messageMap.size > 0;
  const grepChain = buildGrepChain();

  // The blank-line cleanup: collapse 3+ consecutive newlines to 2, trim trailing whitespace.
  // Using awk for portability (works identically on macOS and Linux).
  const cleanupAwk = `awk 'BEGIN{b=0} /^[[:space:]]*$/{b++;if(b<=1)print;next} {b=0;print}' | sed -e :a -e '/^\\n*$/{$d;N;ba' -e '}'`;

  if (!hasMap) {
    // Strip-only: pure shell pipeline, no temp file needed
    const scriptContent = `#!/bin/sh
${grepChain} | ${cleanupAwk}
`;
    const scriptPath = join(tmpdir(), `de-claude-filter-${process.pid}.sh`);
    writeFileSync(scriptPath, scriptContent, 'utf-8');
    chmodSync(scriptPath, '755');
    return scriptPath;
  }

  // Interactive path: embed message map as cksum-keyed lookup in shell script
  const mapEntries = [];
  for (const [original, replacement] of messageMap) {
    // Compute cksum of the trimmed original message for lookup
    // We'll compute it at script generation time using Node, then embed the value
    const trimmed = original.trim();
    const cksum = computeCksum(trimmed);
    // Escape single quotes in replacement for embedding in shell heredoc
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
printf '%s' "$MSG" | ${grepChain} | ${cleanupAwk}
`;

  const scriptPath = join(tmpdir(), `de-claude-filter-${process.pid}.sh`);
  writeFileSync(scriptPath, scriptContent, 'utf-8');
  chmodSync(scriptPath, '755');
  return scriptPath;
}

function computeCksum(text) {
  // Use Node's execSync to get the same cksum the shell script will compute
  const result = execSync(`printf '%s' ${shellQuote(text)} | cksum | cut -d' ' -f1`, {
    encoding: 'utf-8',
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

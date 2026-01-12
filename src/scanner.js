// Patterns to detect Claude attribution
const CLAUDE_PATTERNS = [
  // Co-Authored-By lines containing Claude or anthropic.com (case-insensitive)
  /^co-authored-by:.*claude.*$/im,
  /^co-authored-by:.*@anthropic\.com.*$/im,
  // Generated with Claude Code line
  /^.*Generated with \[Claude Code\].*$/m,
  /^.*Generated with Claude Code.*$/m,
  // The emoji variant
  /^.*🤖.*Generated with.*Claude.*$/m
];

// Patterns for line-by-line removal
const LINE_PATTERNS = [
  /^co-authored-by:.*claude.*/i,
  /^co-authored-by:.*@anthropic\.com.*/i,
  /^.*Generated with \[Claude Code\].*/,
  /^.*Generated with Claude Code.*/,
  /^.*🤖.*Generated with.*Claude.*/
];

export function hasClaudeAttribution(message) {
  return CLAUDE_PATTERNS.some(pattern => pattern.test(message));
}

export function findClaudeLines(message) {
  const lines = message.split('\n');
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of LINE_PATTERNS) {
      if (pattern.test(line)) {
        matches.push({
          lineNumber: i + 1,
          content: line.trim()
        });
        break;
      }
    }
  }

  return matches;
}

export function removeClaudeLines(message) {
  const lines = message.split('\n');
  const filteredLines = lines.filter(line => {
    return !LINE_PATTERNS.some(pattern => pattern.test(line));
  });

  // Clean up excessive blank lines that might result from removal
  let result = filteredLines.join('\n');

  // Remove trailing whitespace and excessive newlines at the end
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

export function scanCommits(commits) {
  return commits
    .filter(commit => hasClaudeAttribution(commit.message))
    .map(commit => ({
      ...commit,
      claudeLines: findClaudeLines(commit.message)
    }));
}

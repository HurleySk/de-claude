// Patterns to detect and remove Claude attribution (line-level matching)
export const LINE_PATTERNS = [
  /^co-authored-by:.*claude.*/i,
  /^co-authored-by:.*@anthropic\.com.*/i,
  /^.*Generated with \[Claude Code\].*/,
  /^.*Generated with Claude Code.*/,
  /^.*🤖.*Generated with.*Claude.*/
];

const BROAD_PATTERN = /claude/i;

export function hasClaudeAttribution(message, { broad = false } = {}) {
  const lines = message.split('\n');
  if (broad) {
    return lines.some(line => BROAD_PATTERN.test(line));
  }
  return lines.some(line => LINE_PATTERNS.some(pattern => pattern.test(line)));
}

export function findClaudeLines(message, { broad = false } = {}) {
  const lines = message.split('\n');
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isAttribution = LINE_PATTERNS.some(pattern => pattern.test(line));
    const isBroadMatch = broad && !isAttribution && BROAD_PATTERN.test(line);
    if (isAttribution || isBroadMatch) {
      matches.push({
        lineNumber: i + 1,
        content: line.trim(),
        matchType: isAttribution ? 'attribution' : 'mention'
      });
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

export function scanCommits(commits, { broad = false } = {}) {
  return commits
    .filter(commit => hasClaudeAttribution(commit.message, { broad }))
    .map(commit => ({
      ...commit,
      claudeLines: findClaudeLines(commit.message, { broad })
    }));
}

import { gitGrepMulti } from './git.js';

const ATTRIBUTION_PATTERNS = [
  { label: 'Co-authored-by (Claude/Anthropic)', pattern: 'co-authored-by.*claude', flags: '-i' },
  { label: 'Co-authored-by (Anthropic email)', pattern: 'co-authored-by.*@anthropic\\.com', flags: '-i' },
  { label: 'Generated with Claude', pattern: 'Generated with.*Claude', flags: '' },
];

const BROAD_PATTERNS = [
  { label: 'Claude mention', pattern: 'claude', flags: '-i' },
];

export function scanFiles({ broad = false } = {}) {
  const patterns = broad
    ? [...ATTRIBUTION_PATTERNS, ...BROAD_PATTERNS]
    : ATTRIBUTION_PATTERNS;

  // Group patterns by flags to minimize git subprocess calls
  const groups = new Map();
  for (const { pattern, flags } of patterns) {
    if (!groups.has(flags)) groups.set(flags, []);
    groups.get(flags).push(pattern);
  }

  const seen = new Set();
  const results = [];

  for (const [flags, groupPatterns] of groups) {
    const matches = gitGrepMulti(groupPatterns, flags);
    for (const match of matches) {
      const key = `${match.file}:${match.lineNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Assign the most specific matching label
        const matchedPattern = patterns.find(p => match.content.match(new RegExp(p.pattern, p.flags === '-i' ? 'i' : '')));
        results.push({ ...match, matchType: matchedPattern ? matchedPattern.label : 'Claude mention' });
      }
    }
  }

  // Sort by file, then line number
  results.sort((a, b) => a.file.localeCompare(b.file) || a.lineNumber - b.lineNumber);
  return results;
}

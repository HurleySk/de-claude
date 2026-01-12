import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hasClaudeAttribution, findClaudeLines, removeClaudeLines } from '../src/scanner.js';

describe('hasClaudeAttribution', () => {
  it('detects Co-Authored-By with Claude', () => {
    const message = `Fix bug

Co-Authored-By: Claude <noreply@anthropic.com>`;
    assert.strictEqual(hasClaudeAttribution(message), true);
  });

  it('detects Co-Authored-By with Claude Opus', () => {
    const message = `Fix bug

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;
    assert.strictEqual(hasClaudeAttribution(message), true);
  });

  it('detects Co-Authored-By with anthropic.com email', () => {
    const message = `Fix bug

Co-Authored-By: Someone <someone@anthropic.com>`;
    assert.strictEqual(hasClaudeAttribution(message), true);
  });

  it('detects Generated with Claude Code line', () => {
    const message = `Fix bug

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
    assert.strictEqual(hasClaudeAttribution(message), true);
  });

  it('is case insensitive for Co-Authored-By', () => {
    const message = `Fix bug

co-authored-by: CLAUDE <noreply@anthropic.com>`;
    assert.strictEqual(hasClaudeAttribution(message), true);
  });

  it('returns false for commits without Claude attribution', () => {
    const message = `Fix bug

Co-Authored-By: John Doe <john@example.com>`;
    assert.strictEqual(hasClaudeAttribution(message), false);
  });

  it('returns false for plain commit messages', () => {
    const message = 'Fix bug';
    assert.strictEqual(hasClaudeAttribution(message), false);
  });
});

describe('findClaudeLines', () => {
  it('finds all Claude-related lines', () => {
    const message = `Fix bug

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
    const lines = findClaudeLines(message);
    assert.strictEqual(lines.length, 2);
  });

  it('returns empty array for clean messages', () => {
    const message = 'Fix bug';
    const lines = findClaudeLines(message);
    assert.strictEqual(lines.length, 0);
  });
});

describe('removeClaudeLines', () => {
  it('removes Co-Authored-By line', () => {
    const message = `Fix bug

Co-Authored-By: Claude <noreply@anthropic.com>`;
    const result = removeClaudeLines(message);
    assert.strictEqual(result, 'Fix bug');
  });

  it('removes Generated with Claude Code line', () => {
    const message = `Fix bug

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
    const result = removeClaudeLines(message);
    assert.strictEqual(result, 'Fix bug');
  });

  it('removes multiple Claude lines', () => {
    const message = `Fix bug

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
    const result = removeClaudeLines(message);
    assert.strictEqual(result, 'Fix bug');
  });

  it('preserves non-Claude co-authors', () => {
    const message = `Fix bug

Co-Authored-By: John Doe <john@example.com>
Co-Authored-By: Claude <noreply@anthropic.com>`;
    const result = removeClaudeLines(message);
    assert.strictEqual(result, `Fix bug

Co-Authored-By: John Doe <john@example.com>`);
  });

  it('cleans up excessive blank lines', () => {
    const message = `Fix bug



🤖 Generated with [Claude Code](https://claude.com/claude-code)



Co-Authored-By: Claude <noreply@anthropic.com>`;
    const result = removeClaudeLines(message);
    assert.strictEqual(result, 'Fix bug');
  });
});

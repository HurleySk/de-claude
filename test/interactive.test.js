import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFilterScript, cleanupFilterScript } from '../src/rewriter.js';
import { execSync } from 'child_process';

describe('createFilterScript with messageMap', () => {
  it('creates a script that replaces mapped messages', () => {
    const messageMap = new Map([
      ['original message\n\nCo-Authored-By: Claude <noreply@anthropic.com>', 'replaced message']
    ]);
    const filterCommand = createFilterScript(messageMap);

    try {
      const result = execSync(
        `echo "original message\n\nCo-Authored-By: Claude <noreply@anthropic.com>" | ${filterCommand}`,
        { encoding: 'utf-8', shell: '/bin/bash' }
      );
      assert.strictEqual(result.trim(), 'replaced message');
    } finally {
      cleanupFilterScript(filterCommand);
    }
  });

  it('falls back to line stripping for unmapped messages', () => {
    const messageMap = new Map([
      ['some other message', 'replacement']
    ]);
    const filterCommand = createFilterScript(messageMap);

    try {
      const result = execSync(
        `echo "fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>" | ${filterCommand}`,
        { encoding: 'utf-8', shell: '/bin/bash' }
      );
      assert.strictEqual(result.trim(), 'fix bug');
    } finally {
      cleanupFilterScript(filterCommand);
    }
  });

  it('works without a messageMap (backward compat)', () => {
    const filterCommand = createFilterScript();

    try {
      const result = execSync(
        `echo "fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>" | ${filterCommand}`,
        { encoding: 'utf-8', shell: '/bin/bash' }
      );
      assert.strictEqual(result.trim(), 'fix bug');
    } finally {
      cleanupFilterScript(filterCommand);
    }
  });

  it('handles empty messageMap same as no map', () => {
    const filterCommand = createFilterScript(new Map());

    try {
      const result = execSync(
        `echo "fix bug\n\nGenerated with Claude Code" | ${filterCommand}`,
        { encoding: 'utf-8', shell: '/bin/bash' }
      );
      assert.strictEqual(result.trim(), 'fix bug');
    } finally {
      cleanupFilterScript(filterCommand);
    }
  });
});

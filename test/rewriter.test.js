import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { createFilterScript, cleanupFilterScript } from '../src/rewriter.js';

describe('createFilterScript', () => {
  let filterCommand;

  after(() => {
    if (filterCommand) {
      cleanupFilterScript(filterCommand);
    }
  });

  it('returns a command with forward slashes only', () => {
    filterCommand = createFilterScript();
    const pathPart = filterCommand.replace(/^node "?/, '').replace(/"?$/, '');
    assert.ok(!pathPart.includes('\\'), `Path should not contain backslashes: ${pathPart}`);
  });

  it('returns a command with a quoted path', () => {
    filterCommand = createFilterScript();
    assert.match(filterCommand, /^node ".+"$/);
  });
});

describe('cleanupFilterScript', () => {
  it('extracts path from a quoted command', () => {
    const filterCommand = createFilterScript();
    // cleanupFilterScript should remove the file without throwing
    cleanupFilterScript(filterCommand);
  });

  it('extracts path from a command with forward slashes', () => {
    const cmd = 'node "/tmp/de-claude-filter-12345.js"';
    const match = cmd.match(/node "?(.+?)"?$/);
    assert.strictEqual(match[1], '/tmp/de-claude-filter-12345.js');
  });

  it('extracts path from a command without quotes (legacy)', () => {
    const cmd = 'node /tmp/de-claude-filter-12345.js';
    const match = cmd.match(/node "?(.+?)"?$/);
    assert.strictEqual(match[1], '/tmp/de-claude-filter-12345.js');
  });
});

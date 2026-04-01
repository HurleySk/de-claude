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

  it('returns a path to a shell script', () => {
    filterCommand = createFilterScript();
    assert.ok(filterCommand.endsWith('.sh'), `Should be a .sh file: ${filterCommand}`);
  });

  it('returns a path with forward slashes only', () => {
    filterCommand = createFilterScript();
    assert.ok(!filterCommand.includes('\\'), `Path should not contain backslashes: ${filterCommand}`);
  });
});

describe('cleanupFilterScript', () => {
  it('removes the script file without throwing', () => {
    const filterCommand = createFilterScript();
    // cleanupFilterScript should remove the file without throwing
    cleanupFilterScript(filterCommand);
  });

  it('does not throw for nonexistent path', () => {
    cleanupFilterScript('/tmp/nonexistent-de-claude-filter.sh');
  });
});

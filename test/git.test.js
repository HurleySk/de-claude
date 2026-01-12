import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isGitRepo } from '../src/git.js';

describe('isGitRepo', () => {
  it('returns true when in a git repository', () => {
    // This test runs from within the de-claude repo
    assert.strictEqual(isGitRepo(), true);
  });
});

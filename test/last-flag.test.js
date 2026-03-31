import { describe, it } from 'node:test';
import assert from 'node:assert';
import { run } from '../src/index.js';

describe('--last flag', () => {
  it('rejects --last with --range', async () => {
    await assert.rejects(
      () => run({ last: '3', range: 'HEAD~5..HEAD' }),
      { message: '--all, --last, and --range are mutually exclusive. Use one.' }
    );
  });

  it('rejects non-numeric --last', async () => {
    await assert.rejects(
      () => run({ last: 'abc' }),
      { message: '--last requires a positive integer (e.g., --last 3)' }
    );
  });

  it('rejects --last 0', async () => {
    await assert.rejects(
      () => run({ last: '0' }),
      { message: '--last requires a positive integer (e.g., --last 3)' }
    );
  });

  it('rejects negative --last', async () => {
    await assert.rejects(
      () => run({ last: '-2' }),
      { message: '--last requires a positive integer (e.g., --last 3)' }
    );
  });
});

describe('--all flag', () => {
  it('rejects --all with --last', async () => {
    await assert.rejects(
      () => run({ all: true, last: '3' }),
      { message: '--all, --last, and --range are mutually exclusive. Use one.' }
    );
  });

  it('rejects --all with --range', async () => {
    await assert.rejects(
      () => run({ all: true, range: 'HEAD~5..HEAD' }),
      { message: '--all, --last, and --range are mutually exclusive. Use one.' }
    );
  });
});

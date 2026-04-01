import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scanFiles } from '../src/file-scanner.js';

describe('scanFiles', () => {
  it('returns results as an array', () => {
    const results = scanFiles();
    assert.ok(Array.isArray(results));
  });

  it('each result has file, lineNumber, content, matchType', () => {
    const results = scanFiles({ broad: true });
    if (results.length > 0) {
      const r = results[0];
      assert.ok(typeof r.file === 'string');
      assert.ok(typeof r.lineNumber === 'number');
      assert.ok(typeof r.content === 'string');
      assert.ok(typeof r.matchType === 'string');
    }
  });

  it('broad mode finds more or equal results than default', () => {
    const defaultResults = scanFiles();
    const broadResults = scanFiles({ broad: true });
    assert.ok(broadResults.length >= defaultResults.length);
  });

  it('results are sorted by file then line number', () => {
    const results = scanFiles({ broad: true });
    for (let i = 1; i < results.length; i++) {
      const cmp = results[i - 1].file.localeCompare(results[i].file);
      if (cmp === 0) {
        assert.ok(results[i - 1].lineNumber <= results[i].lineNumber,
          `Expected ${results[i - 1].file}:${results[i - 1].lineNumber} <= ${results[i].file}:${results[i].lineNumber}`);
      }
    }
  });

  it('does not contain duplicate file:lineNumber entries', () => {
    const results = scanFiles({ broad: true });
    const keys = results.map(r => `${r.file}:${r.lineNumber}`);
    const unique = new Set(keys);
    assert.strictEqual(keys.length, unique.size, 'Found duplicate entries');
  });
});

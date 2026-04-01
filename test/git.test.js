import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isGitRepo, isDirty, getCommits, hasParent } from '../src/git.js';

describe('isGitRepo', () => {
  it('returns true when in a git repository', () => {
    // This test runs from within the de-claude repo
    assert.strictEqual(isGitRepo(), true);
  });
});

describe('getCommits with merge history', () => {
  let tmpDir;
  let originalCwd;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'de-claude-test-'));

    // Create a repo with merge commits:
    // main: A -- B -- M -- D
    //              \ /
    // branch:       C
    const git = (cmd) => execSync(`git ${cmd}`, { cwd: tmpDir, encoding: 'utf-8', stdio: 'pipe' });

    git('init -b main');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    // Commit A
    execSync('echo a > a.txt', { cwd: tmpDir });
    git('add a.txt');
    git('commit -m "commit A"');

    // Commit B
    execSync('echo b > b.txt', { cwd: tmpDir });
    git('add b.txt');
    git('commit -m "commit B"');

    // Branch and commit C
    git('checkout -b feature');
    execSync('echo c > c.txt', { cwd: tmpDir });
    git('add c.txt');
    git('commit -m "commit C"');

    // Back to main, merge (creates merge commit M)
    git('checkout main');
    git('merge feature --no-ff -m "merge commit M"');

    // Commit D
    execSync('echo d > d.txt', { cwd: tmpDir });
    git('add d.txt');
    git('commit -m "commit D"');

    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('without firstParent, HEAD~3..HEAD includes merge branch commits', () => {
    // HEAD~3..HEAD should include D, M, C, B (4 commits) because
    // the merge introduces C which is reachable from HEAD but not HEAD~3
    const commits = getCommits('HEAD~3..HEAD', { firstParent: false });
    // With merge traversal, we get more than 3 commits
    assert.ok(commits.length > 3, `Expected >3 commits, got ${commits.length}`);
    const subjects = commits.map(c => c.subject);
    assert.ok(subjects.includes('commit C'), 'Should include merge branch commit C');
  });

  it('with firstParent, HEAD~3..HEAD returns exactly 3 commits', () => {
    const commits = getCommits('HEAD~3..HEAD', { firstParent: true });
    assert.strictEqual(commits.length, 3, `Expected exactly 3 commits, got ${commits.length}`);
    const subjects = commits.map(c => c.subject);
    assert.ok(!subjects.includes('commit C'), 'Should NOT include merge branch commit C');
  });
});

describe('isDirty with submodules', () => {
  let tmpDir;
  let originalCwd;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'de-claude-test-'));

    const git = (cmd) => execSync(`git ${cmd}`, { cwd: tmpDir, encoding: 'utf-8', stdio: 'pipe' });

    // Create a parent repo
    git('init -b main');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    execSync('echo parent > file.txt', { cwd: tmpDir });
    git('add file.txt');
    git('commit -m "initial"');

    // Create a separate repo to use as a submodule
    const subDir = mkdtempSync(join(tmpdir(), 'de-claude-sub-'));
    const subGit = (cmd) => execSync(`git ${cmd}`, { cwd: subDir, encoding: 'utf-8', stdio: 'pipe' });
    subGit('init -b main');
    subGit('config user.email "test@test.com"');
    subGit('config user.name "Test"');
    execSync('echo sub > sub.txt', { cwd: subDir });
    subGit('add sub.txt');
    subGit('commit -m "sub initial"');

    // Add it as a submodule (allow local file:// transport for test)
    git('-c protocol.file.allow=always submodule add ' + subDir.replace(/\\/g, '/') + ' mysub');
    git('commit -m "add submodule"');

    // Make a new commit in the submodule to create a dirty pointer
    subGit('commit --allow-empty -m "new sub commit"');
    execSync('git -C mysub pull', { cwd: tmpDir, encoding: 'utf-8', stdio: 'pipe' });

    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not report dirty when only the submodule pointer changed', () => {
    // The submodule pointer is modified, but isDirty() should ignore it
    assert.strictEqual(isDirty(), false);
  });

  it('reports dirty when a tracked file in the parent repo is modified', () => {
    execSync('echo modified > file.txt', { cwd: tmpDir });
    assert.strictEqual(isDirty(), true);
    // Restore
    execSync('git checkout file.txt', { cwd: tmpDir, stdio: 'pipe' });
  });
});

describe('hasParent', () => {
  let tmpDir;
  let originalCwd;
  let rootHash;
  let childHash;

  before(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'de-claude-test-'));

    const git = (cmd) => execSync(`git ${cmd}`, { cwd: tmpDir, encoding: 'utf-8', stdio: 'pipe' });

    git('init -b main');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    execSync('echo root > root.txt', { cwd: tmpDir });
    git('add root.txt');
    git('commit -m "root commit"');
    rootHash = git('rev-parse HEAD').trim();

    execSync('echo child > child.txt', { cwd: tmpDir });
    git('add child.txt');
    git('commit -m "child commit"');
    childHash = git('rev-parse HEAD').trim();

    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false for the root commit', () => {
    assert.strictEqual(hasParent(rootHash), false);
  });

  it('returns true for a non-root commit', () => {
    assert.strictEqual(hasParent(childHash), true);
  });
});

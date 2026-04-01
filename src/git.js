import { execSync } from 'child_process';

function runGit(args, options = {}) {
  try {
    const result = execSync(`git ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return result.trim();
  } catch (error) {
    if (options.throwOnError !== false) {
      throw error;
    }
    return null;
  }
}

export function isGitRepo() {
  const result = runGit('rev-parse --is-inside-work-tree', { throwOnError: false });
  return result === 'true';
}

export function isDirty() {
  // Only check for staged/unstaged changes to tracked files.
  // Untracked files (like worktree directories) are not at risk
  // from filter-branch and should not block operation.
  const status = runGit('status --porcelain -uno');
  return status.length > 0;
}

export function getTrackingBranch() {
  const result = runGit('rev-parse --abbrev-ref --symbolic-full-name @{u}', { throwOnError: false });
  return result;
}

export function getCurrentBranch() {
  return runGit('rev-parse --abbrev-ref HEAD');
}

export function hasParent(hash) {
  const result = runGit(`rev-parse --verify ${hash}~1`, { throwOnError: false });
  return result !== null;
}

export function hasRemote() {
  const result = runGit('remote', { throwOnError: false });
  return result && result.length > 0;
}

export function getCommitRange(explicitRange, trackingBranch) {
  if (explicitRange) {
    return explicitRange;
  }

  if (trackingBranch) {
    return `${trackingBranch}..HEAD`;
  }

  // No tracking branch - get all commits on current branch
  const currentBranch = getCurrentBranch();

  // Find the root commit or merge-base with default branch (if different from current)
  const defaultBranch = getDefaultBranch();
  if (defaultBranch && defaultBranch !== currentBranch) {
    const mergeBase = runGit(`merge-base ${defaultBranch} HEAD`, { throwOnError: false });
    if (mergeBase) {
      return `${mergeBase}..HEAD`;
    }
  }

  // Fallback: all commits on current branch (use root commit as base)
  // This handles the case where we're on main/master with no remote
  return 'ROOT..HEAD';
}

function getDefaultBranch() {
  // Try common default branch names
  for (const branch of ['main', 'master']) {
    const result = runGit(`rev-parse --verify ${branch}`, { throwOnError: false });
    if (result) {
      return branch;
    }
  }
  return null;
}

export function getCommits(range, { firstParent = false } = {}) {
  // Handle special cases
  let logRange;
  if (range === 'HEAD' || range === 'ROOT..HEAD') {
    // All commits on current branch
    logRange = 'HEAD';
  } else {
    logRange = range;
  }

  const firstParentFlag = firstParent ? '--first-parent ' : '';
  const format = '%H%x00%s%x00%B%x00';
  const output = runGit(`log ${firstParentFlag}--format="${format}" ${logRange}`, { throwOnError: false });

  if (!output) {
    return [];
  }

  const commits = [];

  // Parse the output - each commit has hash, subject, and full body
  const lines = output.split('\x00');

  for (let i = 0; i < lines.length - 1; i += 3) {
    const hash = lines[i].trim();
    const subject = lines[i + 1];
    const body = lines[i + 2];

    if (hash) {
      commits.push({
        hash: hash.substring(0, 7),
        fullHash: hash,
        subject,
        message: body
      });
    }
  }

  return commits;
}

export function needsForcePush(trackingBranch) {
  if (!trackingBranch) {
    return false;
  }

  // Single call to check ahead/behind counts using symmetric difference
  const counts = runGit(`rev-list --left-right --count HEAD...${trackingBranch}`, { throwOnError: false });
  if (!counts) return false;

  const [ahead] = counts.split('\t');
  return parseInt(ahead) > 0;
}

export function forcePush() {
  const tracking = getTrackingBranch();
  if (!tracking) {
    const branch = getCurrentBranch();
    return runGit(`push --force-with-lease --set-upstream origin ${branch}`, { throwOnError: true });
  }
  return runGit('push --force-with-lease', { throwOnError: true });
}

export function gitGrep(pattern, flags = '') {
  return gitGrepMulti([pattern], flags);
}

export function gitGrepMulti(patterns, flags = '') {
  const patternArgs = patterns.map(p => `-e ${JSON.stringify(p)}`).join(' ');
  const output = runGit(`grep -n ${flags} ${patternArgs}`, { throwOnError: false });
  if (!output) return [];

  return output.split('\n').filter(Boolean).map(line => {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) return null;
    return { file: match[1], lineNumber: parseInt(match[2], 10), content: match[3] };
  }).filter(Boolean);
}

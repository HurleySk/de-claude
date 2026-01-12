import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

async function runGitAsync(args, options = {}) {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      encoding: 'utf-8',
      ...options
    });
    return stdout.trim();
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
  const status = runGit('status --porcelain');
  return status.length > 0;
}

export function getTrackingBranch() {
  const result = runGit('rev-parse --abbrev-ref --symbolic-full-name @{u}', { throwOnError: false });
  return result;
}

export function getCurrentBranch() {
  return runGit('rev-parse --abbrev-ref HEAD');
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

export function getCommits(range) {
  // Handle special cases
  let logRange;
  if (range === 'HEAD' || range === 'ROOT..HEAD') {
    // All commits on current branch
    logRange = 'HEAD';
  } else {
    logRange = range;
  }

  const format = '%H%x00%s%x00%B%x00';
  const output = runGit(`log --format="${format}" ${logRange}`, { throwOnError: false });

  if (!output) {
    return [];
  }

  const commits = [];
  const entries = output.split('%x00\n').filter(Boolean);

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

  // Check if there are commits on remote that we have locally
  const behindCount = runGit(`rev-list --count HEAD..${trackingBranch}`, { throwOnError: false });
  const aheadCount = runGit(`rev-list --count ${trackingBranch}..HEAD`, { throwOnError: false });

  // If we're ahead and remote has our commits, we'll need force push after rewriting
  // Actually, we need to check if the commits we're rewriting exist on remote
  return aheadCount && parseInt(aheadCount) > 0;
}

export function getFirstCommitInRange(range) {
  if (range === 'HEAD') {
    // Get the very first commit
    return runGit('rev-list --max-parents=0 HEAD', { throwOnError: false });
  }

  const [base] = range.split('..');
  return base;
}

export async function rewriteCommits(range, messageFilter) {
  const envScript = messageFilter;

  // Use git filter-branch with msg-filter
  // The messageFilter should be a path to a script that filters stdin to stdout
  const result = await runGitAsync(
    `filter-branch --force --msg-filter "${messageFilter}" ${range}`,
    { throwOnError: false }
  );

  return result !== null;
}

export function getCommitsBetween(base, head = 'HEAD') {
  const output = runGit(`rev-list ${base}..${head}`, { throwOnError: false });
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

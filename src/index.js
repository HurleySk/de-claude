import {
  isGitRepo,
  isDirty,
  getTrackingBranch,
  getCommitRange,
  getCommits,
  hasRemote,
  needsForcePush,
  forcePush
} from './git.js';

import { scanCommits } from './scanner.js';
import { rewriteCommits } from './rewriter.js';
import {
  showPreview,
  showDryRun,
  showResult,
  showError,
  showInfo,
  showRemoteWarning,
  confirm
} from './ui.js';

export async function run(options) {
  const { dryRun, yes, verbose, range: explicitRange, remote, last } = options;

  // Check if we're in a git repository
  if (!isGitRepo()) {
    throw new Error('Not a git repository. Please run this command from within a git repository.');
  }

  // Validate --last and --range are mutually exclusive
  if (last && explicitRange) {
    throw new Error('--last and --range are mutually exclusive. Use one or the other.');
  }

  // Validate --last is a positive integer
  if (last !== undefined) {
    const n = parseInt(last, 10);
    if (isNaN(n) || n <= 0) {
      throw new Error('--last requires a positive integer (e.g., --last 3)');
    }
  }

  // Convert --last N to a range
  const effectiveRange = last ? `HEAD~${parseInt(last, 10)}..HEAD` : explicitRange;

  // Validate --remote requires --range or --last
  if (remote && !effectiveRange) {
    throw new Error('--remote requires --range or --last (e.g., --remote --last 5)');
  }

  // Validate --remote requires a remote
  if (remote && !hasRemote()) {
    throw new Error('No remote configured. --remote requires a git remote.');
  }

  // Check for uncommitted changes
  if (isDirty()) {
    throw new Error('You have uncommitted changes. Please commit or stash your changes before running de-claude.');
  }

  // Determine the commit range to process
  const trackingBranch = getTrackingBranch();
  const commitRange = getCommitRange(effectiveRange, trackingBranch);

  // Get all commits in range
  const allCommits = getCommits(commitRange);

  if (allCommits.length === 0) {
    if (!effectiveRange && trackingBranch) {
      // All commits are already pushed — suggest --remote
      showInfo(
        'No unpushed commits found. All commits are already on the remote.\n' +
        '  To clean already-pushed commits, use:\n' +
        '    de-claude --remote --last N'
      );
    } else {
      showInfo('No commits found in the specified range.');
    }
    return;
  }

  // Scan for commits with Claude attribution
  const affectedCommits = scanCommits(allCommits);

  if (affectedCommits.length === 0) {
    showInfo('No commits with Claude attribution found.');
    return;
  }

  // Handle dry-run mode
  if (dryRun) {
    showDryRun(affectedCommits, allCommits.length, verbose);
    return;
  }

  // Show preview
  showPreview(affectedCommits, allCommits.length, verbose);

  // Remote mode: show strong warning
  if (remote) {
    showRemoteWarning();

    // Always require explicit confirmation for remote, even with --yes
    const proceed = await confirm('Force-push rewritten commits to origin?');
    if (!proceed) {
      console.log('\nAborted.\n');
      return;
    }
  } else if (!yes) {
    const proceed = await confirm('Proceed with rewriting history?');
    if (!proceed) {
      console.log('\nAborted.\n');
      return;
    }
  }

  // Rewrite commits
  console.log('\nRewriting commits...');
  const result = await rewriteCommits(commitRange, affectedCommits);

  if (!result.success) {
    throw new Error(`Failed to rewrite commits: ${result.error}`);
  }

  // Force-push if --remote
  if (remote) {
    console.log('Force-pushing to origin...');
    try {
      forcePush();
      console.log('');
      showResult(affectedCommits.length, 'pushed');
    } catch (error) {
      throw new Error(
        `Commits were rewritten locally, but force-push failed: ${error.message}\n` +
        'You can retry with: git push --force-with-lease'
      );
    }
    return;
  }

  // Determine push status
  let pushStatus;
  if (!hasRemote()) {
    pushStatus = 'no-remote';
  } else if (!trackingBranch) {
    pushStatus = 'no-remote';
  } else if (needsForcePush(trackingBranch)) {
    pushStatus = 'force-push-needed';
  } else {
    pushStatus = 'normal-push';
  }

  showResult(affectedCommits.length, pushStatus);
}

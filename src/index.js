import {
  isGitRepo,
  isDirty,
  getTrackingBranch,
  getCommitRange,
  getCommits,
  hasRemote,
  needsForcePush
} from './git.js';

import { scanCommits } from './scanner.js';
import { rewriteCommits } from './rewriter.js';
import {
  showPreview,
  showDryRun,
  showResult,
  showError,
  showInfo,
  confirm
} from './ui.js';

export async function run(options) {
  const { dryRun, yes, verbose, range: explicitRange } = options;

  // Check if we're in a git repository
  if (!isGitRepo()) {
    throw new Error('Not a git repository. Please run this command from within a git repository.');
  }

  // Check for uncommitted changes
  if (isDirty()) {
    throw new Error('You have uncommitted changes. Please commit or stash your changes before running de-claude.');
  }

  // Determine the commit range to process
  const trackingBranch = getTrackingBranch();
  const commitRange = getCommitRange(explicitRange, trackingBranch);

  // Get all commits in range
  const allCommits = getCommits(commitRange);

  if (allCommits.length === 0) {
    showInfo('No commits found in the specified range.');
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

  // Confirm with user (unless --yes flag is set)
  if (!yes) {
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

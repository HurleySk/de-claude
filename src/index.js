import {
  isGitRepo,
  isDirty,
  getTrackingBranch,
  getCommitRange,
  getCommits,
  hasRemote,
  hasParent,
  needsForcePush,
  forcePush
} from './git.js';

import { scanCommits } from './scanner.js';
import { scanFiles } from './file-scanner.js';
import { promptForRewrites } from './interactive.js';
import { rewriteCommits } from './rewriter.js';
import {
  showPreview,
  showDryRun,
  showResult,
  showInfo,
  showRemoteWarning,
  showFileScanResults,
  confirm
} from './ui.js';

function validateOptions({ last, range: explicitRange, all, remote }) {
  if (!isGitRepo()) {
    throw new Error('Not a git repository. Please run this command from within a git repository.');
  }

  if ([last, explicitRange, all].filter(Boolean).length > 1) {
    throw new Error('--all, --last, and --range are mutually exclusive. Use one.');
  }

  if (last !== undefined) {
    const n = Number(last);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('--last requires a positive integer (e.g., --last 3)');
    }
  }

  const effectiveRange = all ? 'ROOT..HEAD'
    : last ? `HEAD~${Number(last)}..HEAD`
    : explicitRange;

  if (remote && !effectiveRange) {
    throw new Error('--remote requires --range, --last, or --all (e.g., --remote --last 5)');
  }

  if (remote && !hasRemote()) {
    throw new Error('No remote configured. --remote requires a git remote.');
  }

  if (isDirty()) {
    throw new Error('You have uncommitted changes. Please commit or stash your changes before running de-claude.');
  }

  return effectiveRange;
}

function determinePushStatus(trackingBranch) {
  if (!hasRemote() || !trackingBranch) {
    return 'no-remote';
  }
  if (needsForcePush(trackingBranch)) {
    return 'force-push-needed';
  }
  return 'normal-push';
}

export async function run(options) {
  const { dryRun, yes, verbose, remote, last, broad } = options;

  const effectiveRange = validateOptions(options);

  const trackingBranch = getTrackingBranch();
  const commitRange = getCommitRange(effectiveRange, trackingBranch);

  // Use --first-parent with --last to avoid counting merge branch commits
  const allCommits = getCommits(commitRange, { firstParent: !!last });

  if (allCommits.length === 0) {
    if (!effectiveRange && trackingBranch) {
      showInfo(
        'No unpushed commits found. All commits are already on the remote.\n' +
        '  To clean already-pushed commits, use:\n' +
        '    de-claude --remote --last N  (or --remote --all for entire history)'
      );
    } else {
      showInfo(`No commits found in range: ${commitRange}`);
    }
    return;
  }

  const affectedCommits = scanCommits(allCommits, { broad });

  if (affectedCommits.length === 0) {
    showInfo(`No commits with Claude attribution found (scanned ${allCommits.length} commit${allCommits.length === 1 ? '' : 's'}).`);
    return;
  }

  // Compute rewrite range from oldest affected commit (narrower than scan range)
  const oldestAffected = affectedCommits[affectedCommits.length - 1];
  const rewriteRange = hasParent(oldestAffected.fullHash)
    ? `${oldestAffected.fullHash}~1..HEAD`
    : 'ROOT..HEAD';
  const oldestIdx = allCommits.findIndex(c => c.fullHash === oldestAffected.fullHash);
  const rewriteCount = oldestIdx + 1;

  if (dryRun) {
    showDryRun(affectedCommits, rewriteCount, verbose);
    return;
  }

  showPreview(affectedCommits, rewriteCount, verbose);

  if (remote) {
    showRemoteWarning();
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

  console.log('\nRewriting commits...');
  const result = await rewriteCommits(rewriteRange, affectedCommits);

  if (!result.success) {
    throw new Error(`Failed to rewrite commits: ${result.error}`);
  }

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

  const pushStatus = determinePushStatus(trackingBranch);
  showResult(affectedCommits.length, pushStatus);

  if (pushStatus === 'force-push-needed' && effectiveRange) {
    showInfo('Tip: Use --remote to automatically force-push in one step.');
  }
}

export async function runScanFiles(options) {
  if (!isGitRepo()) {
    throw new Error('Not a git repository. Please run this command from within a git repository.');
  }

  const results = scanFiles({ broad: !!options.broad });
  showFileScanResults(results);
}

export async function runInteractiveScan(options) {
  const { dryRun, verbose, remote, last, broad } = options;

  const effectiveRange = validateOptions(options);

  const trackingBranch = getTrackingBranch();
  const commitRange = getCommitRange(effectiveRange, trackingBranch);
  const allCommits = getCommits(commitRange, { firstParent: !!last });

  if (allCommits.length === 0) {
    if (!effectiveRange && trackingBranch) {
      showInfo(
        'No unpushed commits found. All commits are already on the remote.\n' +
        '  To scan already-pushed commits, use:\n' +
        '    de-claude scan --remote --last N  (or --remote --all for entire history)'
      );
    } else {
      showInfo(`No commits found in range: ${commitRange}`);
    }
    return;
  }

  const affectedCommits = scanCommits(allCommits, { broad });

  if (affectedCommits.length === 0) {
    showInfo(`No commits with Claude attribution found (scanned ${allCommits.length} commit${allCommits.length === 1 ? '' : 's'}).`);
    return;
  }

  if (dryRun) {
    showDryRun(affectedCommits, allCommits.length, verbose);
    return;
  }

  // Interactive: prompt user per commit
  const { messageMap, stripCommits, skippedCount } = await promptForRewrites(affectedCommits);

  const commitsToRewrite = [...stripCommits, ...affectedCommits.filter(c => messageMap.has(c.message))];

  if (commitsToRewrite.length === 0) {
    showInfo('All commits skipped. No changes made.');
    return;
  }

  // Compute rewrite range from oldest affected commit among those being changed
  const allChanging = commitsToRewrite.map(c => c.fullHash);
  const oldestIdx = Math.max(...allChanging.map(h => allCommits.findIndex(c => c.fullHash === h)));
  const oldestCommit = allCommits[oldestIdx];
  const rewriteRange = hasParent(oldestCommit.fullHash)
    ? `${oldestCommit.fullHash}~1..HEAD`
    : 'ROOT..HEAD';
  const rewriteCount = oldestIdx + 1;

  console.log();
  console.log(`${commitsToRewrite.length} commit${commitsToRewrite.length === 1 ? '' : 's'} to rewrite (${messageMap.size} edited, ${stripCommits.length} stripped${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}).`);

  if (remote) {
    showRemoteWarning();
    const proceed = await confirm('Force-push rewritten commits to origin?');
    if (!proceed) {
      console.log('\nAborted.\n');
      return;
    }
  } else {
    const proceed = await confirm('Proceed with rewriting history?');
    if (!proceed) {
      console.log('\nAborted.\n');
      return;
    }
  }

  console.log('\nRewriting commits...');
  const result = await rewriteCommits(rewriteRange, commitsToRewrite, { messageMap });

  if (!result.success) {
    throw new Error(`Failed to rewrite commits: ${result.error}`);
  }

  if (remote) {
    console.log('Force-pushing to origin...');
    try {
      forcePush();
      console.log('');
      showResult(commitsToRewrite.length, 'pushed');
    } catch (error) {
      throw new Error(
        `Commits were rewritten locally, but force-push failed: ${error.message}\n` +
        'You can retry with: git push --force-with-lease'
      );
    }
    return;
  }

  const pushStatus = determinePushStatus(trackingBranch);
  showResult(commitsToRewrite.length, pushStatus);

  if (pushStatus === 'force-push-needed' && effectiveRange) {
    showInfo('Tip: Use --remote to automatically force-push in one step.');
  }
}

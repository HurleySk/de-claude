import chalk from 'chalk';
import inquirer from 'inquirer';

export function showPreview(affectedCommits, totalCommitsInRange, verbose = false) {
  console.log();
  console.log(chalk.bold(`Found ${affectedCommits.length} commit${affectedCommits.length === 1 ? '' : 's'} with Claude attribution to clean:`));
  console.log();

  for (const commit of affectedCommits) {
    const lineCount = commit.claudeLines.length;
    console.log(`  ${chalk.yellow(commit.hash)} - ${commit.subject} ${chalk.dim(`(${lineCount} line${lineCount === 1 ? '' : 's'} to remove)`)}`);

    if (verbose) {
      for (const line of commit.claudeLines) {
        console.log(chalk.dim(`           └─ ${line.content}`));
      }
    }
  }

  // Note about other commits being rewritten
  const otherCommits = totalCommitsInRange - affectedCommits.length;
  if (otherCommits > 0) {
    console.log();
    console.log(chalk.dim(`Note: ${otherCommits} other commit${otherCommits === 1 ? '' : 's'} will be rewritten due to history linearization.`));
  }

  console.log();
}

export async function confirm(message = 'Proceed?') {
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message,
      default: false
    }
  ]);

  return proceed;
}

export function showResult(count, pushStatus) {
  console.log();
  console.log(chalk.green(`Done! ${count} commit${count === 1 ? '' : 's'} cleaned.`));

  switch (pushStatus) {
    case 'force-push-needed':
      console.log(chalk.yellow(`Run ${chalk.bold('git push --force')} to update the remote.`));
      break;
    case 'normal-push':
      console.log(chalk.dim('You can push normally.'));
      break;
    case 'no-remote':
      // No message needed
      break;
  }

  console.log();
}

export function showDryRun(affectedCommits, totalCommitsInRange, verbose = false) {
  console.log();
  console.log(chalk.cyan.bold('[DRY RUN] No changes will be made.'));
  showPreview(affectedCommits, totalCommitsInRange, verbose);

  if (affectedCommits.length > 0) {
    console.log(chalk.dim('Run without --dry-run to apply these changes.'));
    console.log();
  }
}

export function showError(message) {
  console.error();
  console.error(chalk.red('Error: ') + message);
  console.error();
}

export function showInfo(message) {
  console.log();
  console.log(chalk.blue('Info: ') + message);
  console.log();
}

export function showWarning(message) {
  console.log();
  console.log(chalk.yellow('Warning: ') + message);
  console.log();
}

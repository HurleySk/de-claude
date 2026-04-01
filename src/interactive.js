import chalk from 'chalk';
import inquirer from 'inquirer';
import { removeClaudeLines } from './scanner.js';

export async function promptForRewrites(affectedCommits) {
  const messageMap = new Map();
  const stripCommits = [];
  let skippedCount = 0;

  console.log();
  console.log(chalk.bold(`Found ${affectedCommits.length} commit${affectedCommits.length === 1 ? '' : 's'} with Claude attribution:`));

  for (const commit of affectedCommits) {
    console.log();
    console.log(`  ${chalk.yellow(commit.hash)} ${commit.subject}`);
    for (const line of commit.claudeLines) {
      console.log(chalk.dim(`           └─ ${line.content}`));
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Strip Claude lines (auto-remove attribution)', value: 'strip' },
          { name: 'Edit message manually', value: 'edit' },
          { name: 'Skip (leave unchanged)', value: 'skip' }
        ]
      }
    ]);

    if (action === 'strip') {
      stripCommits.push(commit);
    } else if (action === 'edit') {
      const cleaned = removeClaudeLines(commit.message);
      const { newMessage } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'newMessage',
          message: 'Edit the commit message:',
          default: cleaned
        }
      ]);

      const trimmed = newMessage.trim();
      if (trimmed && trimmed !== commit.message.trim()) {
        messageMap.set(commit.message, trimmed);
      } else if (trimmed === commit.message.trim()) {
        // User didn't change anything, skip
        skippedCount++;
      } else {
        // Empty message, treat as strip
        stripCommits.push(commit);
      }
    } else {
      skippedCount++;
    }
  }

  return { messageMap, stripCommits, skippedCount };
}

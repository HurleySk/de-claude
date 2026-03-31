#!/usr/bin/env node

import { program } from 'commander';
import { run } from '../src/index.js';

program
  .name('de-claude')
  .description('Remove Claude co-authorship attribution from git commits')
  .version('1.3.1')
  .option('--dry-run', 'Preview which commits would be cleaned, without making changes')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--verbose', 'Show the exact attribution lines that will be removed')
  .option('--last <n>', 'Process only the last N commits')
  .option('--all', 'Process all commits on the current branch (entire history)')
  .option('--range <range>', 'Process an explicit commit range (e.g., HEAD~5..HEAD)')
  .option('--remote', 'Force-push rewritten commits to origin (rewrites published history)')
  .addHelpText('after', `
By default, scans only unpushed commits (ahead of tracking branch).
Use --last, --all, or --range to override. These three are mutually exclusive.

Examples:
  de-claude                      Clean unpushed commits (default)
  de-claude --last 5             Clean the last 5 commits
  de-claude --all --dry-run      Preview cleaning entire branch history
  de-claude --remote --last 10   Clean last 10 commits and force-push`)
  .action(async (options) => {
    try {
      await run(options);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse();

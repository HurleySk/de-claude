#!/usr/bin/env node

import { program } from 'commander';
import { run, runScanFiles, runInteractiveScan } from '../src/index.js';

program
  .name('de-claude')
  .description('Remove Claude co-authorship attribution from git commits')
  .version('2.1.0');

// Default command: clean (strip Claude attribution lines)
const clean = program
  .command('clean', { isDefault: true })
  .description('Strip Claude attribution from commit messages (default)')
  .option('--dry-run', 'Preview which commits would be cleaned, without making changes')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--verbose', 'Show the exact attribution lines that will be removed')
  .option('--last <n>', 'Process only the last N commits')
  .option('--all', 'Process all commits on the current branch (entire history)')
  .option('--range <range>', 'Process an explicit commit range (e.g., HEAD~5..HEAD)')
  .option('--remote', 'Force-push rewritten commits to origin (rewrites published history)')
  .action(async (options) => {
    try {
      await run(options);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

// scan-files: scan tracked files for Claude mentions
program
  .command('scan-files')
  .description('Scan tracked files in the repo for Claude mentions')
  .option('--broad', 'Include broad "claude" keyword matches (not just attribution patterns)')
  .action(async (options) => {
    try {
      await runScanFiles(options);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

// scan: interactive commit message review and rewrite
program
  .command('scan')
  .description('Scan commits for Claude attribution and interactively rewrite messages')
  .option('--dry-run', 'Preview affected commits without making changes')
  .option('--verbose', 'Show the exact attribution lines found')
  .option('--last <n>', 'Process only the last N commits')
  .option('--all', 'Process all commits on the current branch (entire history)')
  .option('--range <range>', 'Process an explicit commit range (e.g., HEAD~5..HEAD)')
  .option('--remote', 'Force-push rewritten commits to origin (rewrites published history)')
  .action(async (options) => {
    try {
      await runInteractiveScan(options);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program.addHelpText('after', `
Subcommands:
  clean (default)   Strip Claude attribution from commit messages
  scan-files        Scan tracked files for Claude mentions
  scan              Interactively review and rewrite commit messages

Examples:
  de-claude                         Clean unpushed commits (default)
  de-claude --last 5                Clean the last 5 commits
  de-claude scan-files              Scan all tracked files for Claude mentions
  de-claude scan-files --broad      Include broad keyword matches
  de-claude scan --last 10          Interactively review last 10 commits
  de-claude scan --remote --all     Review all commits, force-push when done`);

program.parse();

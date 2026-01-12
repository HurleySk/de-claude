#!/usr/bin/env node

import { program } from 'commander';
import { run } from '../src/index.js';

program
  .name('de-claude')
  .description('Remove Claude co-authorship attribution from unpushed git commits')
  .version('1.0.0')
  .option('--dry-run', 'Show what would happen without making changes')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--verbose', 'Show actual lines being removed')
  .option('--range <range>', 'Explicit commit range (e.g., HEAD~5..HEAD)')
  .action(async (options) => {
    try {
      await run(options);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse();

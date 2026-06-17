const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const { scanCommand } = require('./commands/scan');
const { renameCommand } = require('./commands/rename');
const { checkCommand } = require('./commands/check');
const { mergeCommand } = require('./commands/merge');
const { reportCommand } = require('./commands/report');

function addCommonOptions(cmd, isReadOnly) {
  cmd.option('-f, --filter <pattern>', 'glob pattern to filter files (e.g. "*.csv")');
  if (isReadOnly) {
    cmd.option('--dry-run', 'no-op for read-only commands; explicitly confirms no files will be modified');
  } else {
    cmd.option('--dry-run', 'preview changes without applying them');
  }
  cmd.option('-q, --quiet', 'show concise results only');
  return cmd;
}

function handleDryRunBanner(cmd, opts, quiet) {
  if (opts.dryRun && !quiet) {
    console.log(chalk.blue(`ℹ  [dry-run] ${cmd} is a read-only command; no files will be modified.`));
  }
}

function createProgram() {
  const program = new Command();

  program
    .name('labkit')
    .description('CLI tool for research assistants to batch organize experimental data files')
    .version('1.0.0');

  program
    .command('scan')
    .description('Scan directory and identify sample IDs, dates, and instrument sources')
    .argument('[dir]', 'target directory', '.')
    .action(async (dir, opts) => {
      try {
        handleDryRunBanner('scan', opts, opts.quiet);
        const resolved = path.resolve(dir);
        await scanCommand(resolved, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  program
    .command('rename')
    .description('Rename files to unified naming convention (preview with --dry-run)')
    .argument('[dir]', 'target directory', '.')
    .action(async (dir, opts) => {
      try {
        const resolved = path.resolve(dir);
        await renameCommand(resolved, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  program
    .command('check')
    .description('Check for missing files, duplicate samples, empty values, and unit inconsistencies')
    .argument('[dir]', 'target directory', '.')
    .action(async (dir, opts) => {
      try {
        handleDryRunBanner('check', opts, opts.quiet);
        const resolved = path.resolve(dir);
        await checkCommand(resolved, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  program
    .command('merge')
    .description('Merge tables from the same batch and retain source information')
    .argument('[dir]', 'target directory', '.')
    .option('-o, --output <path>', 'output file path or directory for merged results')
    .action(async (dir, opts) => {
      try {
        const resolved = path.resolve(dir);
        await mergeCommand(resolved, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  program
    .command('report')
    .description('Generate report with sample counts, anomalies, processing log, and pending items')
    .argument('[dir]', 'target directory', '.')
    .action(async (dir, opts) => {
      try {
        handleDryRunBanner('report', opts, opts.quiet);
        const resolved = path.resolve(dir);
        await reportCommand(resolved, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  for (const cmd of program.commands) {
    const name = cmd.name();
    const isReadOnly = ['scan', 'check', 'report'].includes(name);
    addCommonOptions(cmd, isReadOnly);
  }

  return program;
}

function run() {
  const program = createProgram();
  program.parse(process.argv);
}

module.exports = { createProgram, run };

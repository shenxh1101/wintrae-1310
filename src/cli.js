const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const { setDryRunMode } = require('./utils/logger');
const { scanCommand } = require('./commands/scan');
const { renameCommand } = require('./commands/rename');
const { checkCommand } = require('./commands/check');
const { mergeCommand } = require('./commands/merge');
const { reportCommand } = require('./commands/report');
const { validateCommand } = require('./commands/validate');

function addCommonOptions(cmd, isReadOnly) {
  cmd.option('-f, --filter <pattern>', 'glob pattern to filter files (e.g. "*.csv")');
  if (isReadOnly) {
    cmd.option('--dry-run', 'no-op for read-only commands; explicitly confirms no files will be modified');
  } else {
    cmd.option('--dry-run', 'preview changes without applying them and without touching disk');
  }
  cmd.option('-q, --quiet', 'show concise results only');
  return cmd;
}

function renderModeBanner(cmd, opts, quiet) {
  if (quiet) return;
  if (opts.dryRun) {
    if (['scan', 'check', 'report', 'validate'].includes(cmd)) {
      console.log(chalk.blue(`ℹ  [dry-run] ${cmd} is a read-only command; no files will be modified.`));
    } else {
      console.log(chalk.yellow(`⚠  [dry-run] ${cmd}: preview only — no disk writes, no logs created.`));
    }
  }
}

function wrapCommand(cmdName, handler, isReadOnly) {
  return async (dir, opts) => {
    try {
      if (opts && opts.dryRun) setDryRunMode(true);
      else setDryRunMode(false);
      renderModeBanner(cmdName, opts, opts && opts.quiet);
      if (cmdName === 'validate') {
        await handler(opts);
      } else {
        const resolved = path.resolve(dir);
        await handler(resolved, opts);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    } finally {
      setDryRunMode(false);
    }
  };
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
    .action(wrapCommand('scan', scanCommand, true));

  program
    .command('rename')
    .description('Rename files to unified naming convention (preview with --dry-run)')
    .argument('[dir]', 'target directory', '.')
    .action(wrapCommand('rename', renameCommand, false));

  program
    .command('check')
    .description('Check for missing files, duplicate samples, empty values, and unit inconsistencies')
    .argument('[dir]', 'target directory', '.')
    .action(wrapCommand('check', checkCommand, true));

  program
    .command('merge')
    .description('Merge tables from the same batch and retain source information')
    .argument('[dir]', 'target directory', '.')
    .option('-o, --output <path>', 'output file path or directory for merged results')
    .action(wrapCommand('merge', mergeCommand, false));

  program
    .command('report')
    .description('Generate report with sample counts, anomalies, processing log, and pending items')
    .argument('[dir]', 'target directory', '.')
    .action(wrapCommand('report', reportCommand, true));

  program
    .command('validate')
    .description('Validate labkit rule config, list active rules, and preview filename recognition')
    .option('-d, --dir <path>', 'directory to search for config (default: cwd)')
    .option('-p, --preview <filenames>', 'comma-separated list of filenames to preview recognition on')
    .option('-q, --quiet', 'show concise results only')
    .action(wrapCommand('validate', validateCommand, true));

  for (const cmd of program.commands) {
    if (cmd.name() === 'validate') continue;
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

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const { scanCommand } = require('./commands/scan');
const { renameCommand } = require('./commands/rename');
const { checkCommand } = require('./commands/check');
const { mergeCommand } = require('./commands/merge');
const { reportCommand } = require('./commands/report');

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
    .option('-f, --filter <pattern>', 'glob pattern to filter files (e.g. "*.csv")')
    .option('-q, --quiet', 'show concise results only')
    .action(async (dir, opts) => {
      try {
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
    .option('-f, --filter <pattern>', 'glob pattern to filter files')
    .option('--dry-run', 'preview changes without applying them')
    .option('-q, --quiet', 'show concise results only')
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
    .option('-f, --filter <pattern>', 'glob pattern to filter files')
    .option('-q, --quiet', 'show concise results only')
    .action(async (dir, opts) => {
      try {
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
    .option('-f, --filter <pattern>', 'glob pattern to filter files')
    .option('--dry-run', 'preview merge without writing files')
    .option('-o, --output <path>', 'output file path for merged result')
    .option('-q, --quiet', 'show concise results only')
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
    .option('-f, --filter <pattern>', 'glob pattern to filter files')
    .option('-q, --quiet', 'show concise results only')
    .action(async (dir, opts) => {
      try {
        const resolved = path.resolve(dir);
        await reportCommand(resolved, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  return program;
}

function run() {
  const program = createProgram();
  program.parse(process.argv);
}

module.exports = { createProgram, run };

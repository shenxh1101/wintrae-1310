const chalk = require('chalk');
const { scanDirectory, getFilesBySample, getFilesByDate, getFilesByInstrument, initializeConfig, getLoadedConfigPath } = require('../utils/scanner');
const { appendLog } = require('../utils/logger');

async function scanCommand(dir, options) {
  const filter = options.filter || null;
  const quiet = options.quiet || false;

  const cfgPath = initializeConfig(dir);
  if (!quiet && cfgPath) {
    console.log(chalk.blue(`ℹ  Using custom rules from: ${cfgPath}`));
  }

  const files = await scanDirectory(dir, filter);

  const withSample = files.filter((f) => f.sampleId);
  const withDate = files.filter((f) => f.date);
  const withInstrument = files.filter((f) => f.instrument);
  const unrecognized = files.filter((f) => !f.sampleId && !f.date && !f.instrument);

  const bySample = getFilesBySample(files);
  const byDate = getFilesByDate(files);
  const byInstrument = getFilesByInstrument(files);

  if (quiet) {
    console.log(`Scan: ${files.length} files | ${withSample.length} with sample | ${withDate.length} with date | ${withInstrument.length} with instrument`);
    appendLog({ command: 'scan', action: 'complete', detail: `${files.length} files scanned` });
    return { total: files.length, withSample: withSample.length, withDate: withDate.length, withInstrument: withInstrument.length };
  }

  console.log(chalk.cyan(`\n📊 Scan Results for: ${dir}`));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(`Total files found:      ${chalk.bold(files.length)}`);
  console.log(`With sample ID:         ${chalk.green(withSample.length)}`);
  console.log(`With date:              ${chalk.green(withDate.length)}`);
  console.log(`With instrument:        ${chalk.green(withInstrument.length)}`);
  console.log(`Unrecognized:           ${chalk.yellow(unrecognized.length)}`);

  if (unrecognized.length > 0 && unrecognized.length <= 20) {
    console.log(chalk.dim('\n  Unrecognized files:'));
    for (const f of unrecognized) {
      console.log(chalk.dim(`    - ${f.basename}`));
    }
  } else if (unrecognized.length > 20) {
    console.log(chalk.dim(`\n  ${unrecognized.length} unrecognized files (use --filter to narrow)`));
  }

  if (bySample.size > 0) {
    console.log(chalk.cyan('\n📁 By Sample ID:'));
    for (const [sampleId, sFiles] of bySample) {
      console.log(`  ${chalk.bold(sampleId)}: ${sFiles.length} file(s)`);
      for (const f of sFiles) {
        console.log(chalk.dim(`    ${f.basename}`));
      }
    }
  }

  if (byDate.size > 0) {
    console.log(chalk.cyan('\n📅 By Date:'));
    for (const [date, dFiles] of byDate) {
      console.log(`  ${chalk.bold(date)}: ${dFiles.length} file(s)`);
    }
  }

  if (byInstrument.size > 0) {
    console.log(chalk.cyan('\n🔬 By Instrument:'));
    for (const [inst, iFiles] of byInstrument) {
      console.log(`  ${chalk.bold(inst)}: ${iFiles.length} file(s)`);
    }
  }

  appendLog({ command: 'scan', action: 'complete', detail: `${files.length} files scanned in ${dir}` });

  return {
    total: files.length,
    withSample: withSample.length,
    withDate: withDate.length,
    withInstrument: withInstrument.length,
    files,
    bySample,
    byDate,
    byInstrument,
    unrecognized,
  };
}

module.exports = { scanCommand };

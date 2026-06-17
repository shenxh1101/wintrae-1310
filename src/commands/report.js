const chalk = require('chalk');
const { readLog } = require('../utils/logger');
const { scanDirectory, getFilesBySample, getFilesByInstrument, initializeConfig, getLoadedConfigPath } = require('../utils/scanner');
const { appendLog } = require('../utils/logger');

async function reportCommand(dir, options) {
  const filter = options.filter || null;
  const quiet = options.quiet || false;

  const cfgPath = initializeConfig(dir);

  const files = await scanDirectory(dir, filter);
  const bySample = getFilesBySample(files);
  const byInstrument = getFilesByInstrument(files);

  const withSample = files.filter((f) => f.sampleId);
  const withoutSample = files.filter((f) => !f.sampleId);
  const withDate = files.filter((f) => f.date);
  const withInstrument = files.filter((f) => f.instrument);

  const logs = readLog();
  const recentLogs = logs.slice(-20);

  const pendingItems = [];

  for (const f of withoutSample) {
    pendingItems.push({ type: 'no_sample_id', file: f.basename, detail: 'Cannot identify sample ID' });
  }

  for (const f of files) {
    if (!f.date) {
      pendingItems.push({ type: 'no_date', file: f.basename, detail: 'Cannot identify date' });
    }
  }

  for (const f of files) {
    if (!f.instrument && f.isDataFile) {
      pendingItems.push({ type: 'no_instrument', file: f.basename, detail: 'Cannot identify instrument source' });
    }
  }

  const duplicateSamples = [];
  for (const [sampleId, sFiles] of bySample) {
    if (sFiles.length > 1) {
      const byExt = new Map();
      for (const f of sFiles) {
        if (!byExt.has(f.ext)) byExt.set(f.ext, []);
        byExt.get(f.ext).push(f);
      }
      for (const [, extFiles] of byExt) {
        if (extFiles.length > 1) {
          duplicateSamples.push({ sampleId, files: extFiles.map((f) => f.basename) });
        }
      }
    }
  }

  if (quiet) {
    console.log(`Report: ${files.length} files | ${bySample.size} samples | ${pendingItems.length} pending | ${duplicateSamples.length} duplicates`);
    appendLog({ command: 'report', action: 'complete', detail: `${files.length} files reported` });
    return {
      totalFiles: files.length,
      sampleCount: bySample.size,
      pendingCount: pendingItems.length,
      duplicateCount: duplicateSamples.length,
    };
  }

  console.log(chalk.cyan(`\n📋 Report for: ${dir}`));
  console.log(chalk.dim('═'.repeat(60)));

  if (cfgPath) {
    console.log(chalk.blue(`ℹ  Custom rules loaded from: ${cfgPath}`));
  }

  console.log(chalk.bold('\n📊 Sample Statistics'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  Total files:           ${chalk.bold(files.length)}`);
  console.log(`  Unique samples:        ${chalk.bold(bySample.size)}`);
  console.log(`  Files with sample ID:  ${chalk.green(withSample.length)}`);
  console.log(`  Files without sample:  ${chalk.yellow(withoutSample.length)}`);
  console.log(`  Files with date:       ${chalk.green(withDate.length)}`);
  console.log(`  Files with instrument: ${chalk.green(withInstrument.length)}`);

  if (bySample.size > 0) {
    console.log(chalk.bold('\n🧪 Sample Breakdown'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const [sampleId, sFiles] of bySample) {
      const instruments = [...new Set(sFiles.map((f) => f.instrument).filter(Boolean))];
      const instStr = instruments.length > 0 ? ` (${instruments.join(', ')})` : '';
      console.log(`  ${chalk.bold(sampleId)}: ${sFiles.length} file(s)${chalk.dim(instStr)}`);
    }
  }

  if (byInstrument.size > 0) {
    console.log(chalk.bold('\n🔬 Instrument Summary'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const [inst, iFiles] of byInstrument) {
      const samples = [...new Set(iFiles.map((f) => f.sampleId).filter(Boolean))];
      console.log(`  ${chalk.bold(inst)}: ${iFiles.length} file(s), ${samples.length} sample(s)`);
    }
  }

  if (duplicateSamples.length > 0) {
    console.log(chalk.bold('\n⚠️  Duplicate Samples'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const dup of duplicateSamples) {
      console.log(chalk.yellow(`  ${dup.sampleId}: ${dup.files.join(', ')}`));
    }
  }

  if (pendingItems.length > 0) {
    console.log(chalk.bold('\n❓ Items Pending Confirmation'));
    console.log(chalk.dim('─'.repeat(40)));
    const grouped = new Map();
    for (const item of pendingItems) {
      if (!grouped.has(item.type)) grouped.set(item.type, []);
      grouped.get(item.type).push(item);
    }

    for (const [type, items] of grouped) {
      const label = type === 'no_sample_id' ? 'No Sample ID' : type === 'no_date' ? 'No Date' : 'No Instrument';
      console.log(chalk.yellow(`  ${label} (${items.length}):`));
      const shown = items.slice(0, 10);
      for (const item of shown) {
        console.log(chalk.dim(`    - ${item.file}`));
      }
      if (items.length > 10) {
        console.log(chalk.dim(`    ... and ${items.length - 10} more`));
      }
    }
  }

  if (recentLogs.length > 0) {
    console.log(chalk.bold('\n📝 Processing Log (last 20 entries)'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const log of recentLogs) {
      const ts = log.timestamp.split('T')[1]?.split('.')[0] || log.timestamp;
      console.log(chalk.dim(`  ${ts} [${log.command}] ${log.action}: ${log.detail}`));
    }
  }

  console.log(chalk.dim('\n═'.repeat(60)));
  console.log(`Pending: ${chalk.yellow(pendingItems.length)} | Duplicates: ${chalk.yellow(duplicateSamples.length)} | Log entries: ${logs.length}`);

  appendLog({ command: 'report', action: 'complete', detail: `${files.length} files, ${bySample.size} samples, ${pendingItems.length} pending` });

  return {
    totalFiles: files.length,
    sampleCount: bySample.size,
    pendingCount: pendingItems.length,
    duplicateCount: duplicateSamples.length,
    pendingItems,
    duplicateSamples,
    recentLogs,
  };
}

module.exports = { reportCommand };

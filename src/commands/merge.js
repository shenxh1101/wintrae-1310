const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { scanDirectory, getFilesByDate, initializeConfig } = require('../utils/scanner');
const { appendLog } = require('../utils/logger');

function readTableFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.csv', '.tsv', '.txt'].includes(ext)) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let delimiter = ',';
    if (ext === '.tsv') delimiter = '\t';
    const firstLine = content.split('\n')[0] || '';
    if (firstLine.includes('\t') && !firstLine.includes(',')) delimiter = '\t';

    const records = parse(content, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
    return records;
  } catch {
    return null;
  }
}

function resolveOutputStrategy(outputOption, batchCount, firstDate) {
  if (!outputOption) {
    return { type: 'auto-dir', message: null };
  }

  const resolved = path.resolve(outputOption);
  let isDir = false;
  try {
    if (fs.existsSync(resolved)) {
      isDir = fs.statSync(resolved).isDirectory();
    } else {
      const ext = path.extname(resolved).toLowerCase();
      isDir = !ext;
    }
  } catch {
    isDir = !path.extname(resolved);
  }

  if (isDir) {
    return { type: 'explicit-dir', dir: resolved, message: null };
  }

  if (batchCount === 1) {
    return { type: 'single-file', filePath: resolved, message: null };
  }

  const dir = path.dirname(resolved);
  const ext = path.extname(resolved);
  const stem = path.basename(resolved, ext);
  const warn = chalk.yellow(
    `⚠  Multiple batches (${batchCount}) detected with single output file. ` +
    `Will split into ${stem}.<DATE>${ext} instead. Consider passing a directory with -o.`
  );
  return {
    type: 'auto-split',
    dir,
    stem,
    ext: ext || '.csv',
    message: warn,
  };
}

function resolveOutputForBatch(strategy, batchDate, defaultDir, defaultStem) {
  switch (strategy.type) {
    case 'auto-dir': {
      const outDir = path.join(defaultDir, 'merged');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      return path.join(outDir, `${defaultStem}_${batchDate}.csv`);
    }
    case 'explicit-dir': {
      if (!fs.existsSync(strategy.dir)) fs.mkdirSync(strategy.dir, { recursive: true });
      return path.join(strategy.dir, `${defaultStem}_${batchDate}.csv`);
    }
    case 'single-file': {
      if (!fs.existsSync(path.dirname(strategy.filePath))) {
        fs.mkdirSync(path.dirname(strategy.filePath), { recursive: true });
      }
      return strategy.filePath;
    }
    case 'auto-split': {
      if (!fs.existsSync(strategy.dir)) fs.mkdirSync(strategy.dir, { recursive: true });
      return path.join(strategy.dir, `${strategy.stem}_${batchDate}${strategy.ext}`);
    }
  }
}

async function mergeCommand(dir, options) {
  const filter = options.filter || null;
  const dryRun = options.dryRun || false;
  const quiet = options.quiet || false;
  const output = options.output || null;

  initializeConfig(dir);

  const files = await scanDirectory(dir, filter);
  const dataFiles = files.filter((f) => f.isDataFile && ['.csv', '.tsv', '.txt'].includes(f.ext));

  const byDate = getFilesByDate(dataFiles);
  const mergeResults = [];

  for (const [date, dateFiles] of byDate) {
    if (dateFiles.length < 2) continue;

    const allRecords = [];
    const sources = [];

    for (const file of dateFiles) {
      const records = readTableFile(file.file);
      if (!records || records.length === 0) continue;

      for (const record of records) {
        record._source = file.basename;
        record._instrument = file.instrument || 'unknown';
        record._sampleId = file.sampleId || 'unknown';
        allRecords.push(record);
      }
      sources.push({ file: file.basename, rows: records.length, instrument: file.instrument, sampleId: file.sampleId });
    }

    if (allRecords.length === 0) continue;

    mergeResults.push({
      date,
      records: allRecords,
      sources,
      totalRows: allRecords.length,
    });
  }

  const strategy = resolveOutputStrategy(output, mergeResults.length, mergeResults[0]?.date);

  if (quiet) {
    const suffix = dryRun ? ' (dry-run)' : '';
    console.log(`Merge: ${mergeResults.length} batch(es) to merge, ${mergeResults.reduce((s, m) => s + m.totalRows, 0)} total rows${suffix}`);
    appendLog({ command: 'merge', action: dryRun ? 'preview' : 'complete', detail: `${mergeResults.length} batches` });
    return { batches: mergeResults.length, dryRun, results: mergeResults };
  }

  if (mergeResults.length === 0) {
    console.log(chalk.yellow('No batches with multiple files found for merging.'));
    appendLog({ command: 'merge', action: 'skip', detail: 'no batches to merge' });
    return { batches: 0, dryRun, results: [] };
  }

  const label = dryRun ? chalk.yellow('🔍 Merge Preview (dry-run)') : chalk.cyan('📎 Merging Tables');
  console.log(label);
  console.log(chalk.dim('─'.repeat(60)));

  if (strategy.message) {
    console.log(strategy.message);
  }

  for (const batch of mergeResults) {
    console.log(`\n📅 Batch: ${chalk.bold(batch.date)}`);
    console.log(`   Files: ${batch.sources.length} | Total rows: ${batch.totalRows}`);

    for (const src of batch.sources) {
      console.log(chalk.dim(`   - ${src.file} (${src.rows} rows, ${src.instrument || 'unknown'})`));
    }

    const outPath = resolveOutputForBatch(strategy, batch.date, dir, 'merged');
    batch.outputPath = outPath;

    if (dryRun) {
      console.log(chalk.yellow(`   Would write: ${outPath}`));
      continue;
    }

    const allCols = new Set();
    for (const rec of batch.records) {
      for (const key of Object.keys(rec)) {
        allCols.add(key);
      }
    }
    const columns = ['_source', '_instrument', '_sampleId', ...[...allCols].filter((c) => !['_source', '_instrument', '_sampleId'].includes(c))];

    const csv = stringify(batch.records, { header: true, columns });

    if (fs.existsSync(outPath)) {
      console.log(chalk.yellow(`   ⚠  Overwriting existing: ${outPath}`));
    }
    fs.writeFileSync(outPath, csv, 'utf8');
    console.log(chalk.green(`   ✓ Written: ${outPath}`));
  }

  console.log(chalk.dim('\n' + '─'.repeat(60)));
  if (dryRun) {
    console.log(chalk.yellow(`Preview: ${mergeResults.length} batch(es) would be merged`));
  } else {
    console.log(chalk.green(`✓ ${mergeResults.length} batch(es) merged successfully`));
  }

  appendLog({
    command: 'merge',
    action: dryRun ? 'preview' : 'complete',
    detail: `${mergeResults.length} batches, ${mergeResults.reduce((s, m) => s + m.totalRows, 0)} total rows`,
  });

  return { batches: mergeResults.length, dryRun, results: mergeResults };
}

module.exports = { mergeCommand };

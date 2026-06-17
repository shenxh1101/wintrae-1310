const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { scanDirectory, getFilesByDate, initializeConfig } = require('../utils/scanner');
const { isDryRun } = require('../utils/logger');
const { appendLog } = require('../utils/logger');

function readTableFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.csv', '.tsv', '.txt'].includes(ext)) {
    return { ok: false, reason: 'unsupported_extension', records: [] };
  }

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

    if (!records || records.length === 0) {
      return { ok: false, reason: 'empty_table', records: [] };
    }
    return { ok: true, reason: null, records };
  } catch (err) {
    return { ok: false, reason: 'parse_error:' + err.message, records: [] };
  }
}

function safeMkdir(dirPath) {
  if (isDryRun()) return false;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return true;
}

function resolveOutputStrategy(outputOption, batchCount) {
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
      safeMkdir(outDir);
      return path.join(outDir, `${defaultStem}_${batchDate}.csv`);
    }
    case 'explicit-dir': {
      safeMkdir(strategy.dir);
      return path.join(strategy.dir, `${defaultStem}_${batchDate}.csv`);
    }
    case 'single-file': {
      safeMkdir(path.dirname(strategy.filePath));
      return strategy.filePath;
    }
    case 'auto-split': {
      safeMkdir(strategy.dir);
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
  const pending = [];

  for (const [date, dateFiles] of byDate) {
    if (dateFiles.length < 2) {
      if (dateFiles.length === 1) {
        pending.push({
          type: 'single_file_batch',
          date,
          file: dateFiles[0].basename,
          detail: `Batch ${date} has only 1 data file (${dateFiles[0].basename}); skipped merge`,
        });
      }
      continue;
    }

    const allRecords = [];
    const sources = [];
    const samples = new Set();
    const instruments = new Set();

    for (const file of dateFiles) {
      const result = readTableFile(file.file);
      if (!result.ok) {
        pending.push({
          type: 'bad_table',
          date,
          file: file.basename,
          reason: result.reason,
          detail: `Skipped ${file.basename} in batch ${date}: ${result.reason}`,
        });
        continue;
      }

      for (const record of result.records) {
        record._source = file.basename;
        record._instrument = file.instrument || 'unknown';
        record._sampleId = file.sampleId || 'unknown';
        allRecords.push(record);
      }
      sources.push({ file: file.basename, rows: result.records.length, instrument: file.instrument, sampleId: file.sampleId });
      if (file.sampleId) samples.add(file.sampleId);
      if (file.instrument) instruments.add(file.instrument);
    }

    if (allRecords.length === 0) {
      pending.push({
        type: 'empty_batch_after_parse',
        date,
        files: dateFiles.map((f) => f.basename),
        detail: `Batch ${date} has no valid rows after parsing; skipped`,
      });
      continue;
    }

    mergeResults.push({
      date,
      records: allRecords,
      sources,
      samples: [...samples].sort(),
      instruments: [...instruments].sort(),
      totalRows: allRecords.length,
    });
  }

  const strategy = resolveOutputStrategy(output, mergeResults.length);

  for (const batch of mergeResults) {
    batch.outputPath = resolveOutputForBatch(strategy, batch.date, dir, 'merged');
  }

  if (quiet) {
    const suffix = dryRun ? ' (dry-run)' : '';
    const pendingNote = pending.length > 0 ? ` | ${pending.length} pending` : '';
    console.log(`Merge: ${mergeResults.length} batch(es) to merge, ${mergeResults.reduce((s, m) => s + m.totalRows, 0)} total rows${pendingNote}${suffix}`);
    appendLog({ command: 'merge', action: dryRun ? 'preview' : 'complete', detail: `${mergeResults.length} batches, ${pending.length} pending` });
    return { batches: mergeResults.length, dryRun, results: mergeResults, pending };
  }

  if (mergeResults.length === 0 && pending.length === 0) {
    console.log(chalk.yellow('No batches with multiple files found for merging.'));
    appendLog({ command: 'merge', action: 'skip', detail: 'no batches to merge' });
    return { batches: 0, dryRun, results: [], pending: [] };
  }

  const label = dryRun ? chalk.yellow('🔍 Merge Preview (dry-run)') : chalk.cyan('📎 Merging Tables');
  console.log(label);
  console.log(chalk.dim('─'.repeat(60)));

  if (strategy.message) {
    console.log(strategy.message);
  }

  if (mergeResults.length > 0) {
    console.log(chalk.bold('\n📋 Batch Manifest'));
    console.log(chalk.dim('─'.repeat(40)));
  }

  for (const batch of mergeResults) {
    console.log(`\n📅 Batch: ${chalk.bold(batch.date)}`);
    console.log(`   Samples:     ${batch.samples.length > 0 ? batch.samples.join(', ') : chalk.dim('(unknown)')}`);
    console.log(`   Instruments: ${batch.instruments.length > 0 ? batch.instruments.join(', ') : chalk.dim('(unknown)')}`);
    console.log(`   Source files: ${batch.sources.length}`);
    for (const src of batch.sources) {
      const meta = [src.instrument || 'unknown-instrument', src.sampleId || 'unknown-sample'].join(' · ');
      console.log(chalk.dim(`     • ${src.file}  (${src.rows} rows, ${meta})`));
    }
    console.log(`   Total rows:  ${batch.totalRows}`);
    console.log(`   Output:      ${dryRun ? chalk.yellow('would write → ') : chalk.green('→ ')}${batch.outputPath}`);

    if (dryRun) continue;

    const allCols = new Set();
    for (const rec of batch.records) {
      for (const key of Object.keys(rec)) {
        allCols.add(key);
      }
    }
    const columns = ['_source', '_instrument', '_sampleId', ...[...allCols].filter((c) => !['_source', '_instrument', '_sampleId'].includes(c))];

    const csv = stringify(batch.records, { header: true, columns });

    if (fs.existsSync(batch.outputPath)) {
      console.log(chalk.yellow(`   ⚠  Overwriting existing: ${batch.outputPath}`));
    }
    fs.writeFileSync(batch.outputPath, csv, 'utf8');
    console.log(chalk.green(`   ✓ Written: ${batch.outputPath}`));
  }

  if (pending.length > 0) {
    console.log(chalk.bold('\n❓ Pending Confirmation'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const p of pending) {
      console.log(chalk.yellow(`  • [${p.type}] ${p.detail}`));
    }
  }

  console.log(chalk.dim('\n' + '─'.repeat(60)));
  if (dryRun) {
    console.log(chalk.yellow(`Preview: ${mergeResults.length} batch(es) would be merged | ${pending.length} item(s) need confirmation`));
  } else {
    console.log(chalk.green(`✓ ${mergeResults.length} batch(es) merged successfully | ${pending.length} item(s) pending confirmation`));
  }

  appendLog({
    command: 'merge',
    action: dryRun ? 'preview' : 'complete',
    detail: `${mergeResults.length} batches, ${mergeResults.reduce((s, m) => s + m.totalRows, 0)} total rows, ${pending.length} pending`,
  });

  return { batches: mergeResults.length, dryRun, results: mergeResults, pending };
}

module.exports = { mergeCommand };

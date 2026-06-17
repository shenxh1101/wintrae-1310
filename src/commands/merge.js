const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { scanDirectory, getFilesByDate } = require('../utils/scanner');
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

async function mergeCommand(dir, options) {
  const filter = options.filter || null;
  const dryRun = options.dryRun || false;
  const quiet = options.quiet || false;
  const output = options.output || null;

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
        allRecords.push(record);
      }
      sources.push({ file: file.basename, rows: records.length, instrument: file.instrument });
    }

    if (allRecords.length === 0) continue;

    mergeResults.push({
      date,
      records: allRecords,
      sources,
      totalRows: allRecords.length,
    });
  }

  if (quiet) {
    console.log(`Merge: ${mergeResults.length} batch(es) to merge, ${mergeResults.reduce((s, m) => s + m.totalRows, 0)} total rows${dryRun ? ' (dry-run)' : ''}`);
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

  for (const batch of mergeResults) {
    console.log(`\n📅 Batch: ${chalk.bold(batch.date)}`);
    console.log(`   Files: ${batch.sources.length} | Total rows: ${batch.totalRows}`);

    for (const src of batch.sources) {
      console.log(chalk.dim(`   - ${src.file} (${src.rows} rows, ${src.instrument})`));
    }

    if (!dryRun) {
      const allCols = new Set();
      for (const rec of batch.records) {
        for (const key of Object.keys(rec)) {
          allCols.add(key);
        }
      }
      const columns = Array.from(allCols);

      const csv = stringify(batch.records, { header: true, columns });

      let outPath;
      if (output) {
        outPath = path.resolve(output);
      } else {
        const outDir = path.join(dir, 'merged');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        outPath = path.join(outDir, `merged_${batch.date}.csv`);
      }

      fs.writeFileSync(outPath, csv, 'utf8');
      console.log(chalk.green(`   ✓ Written: ${outPath}`));
      batch.outputPath = outPath;
    }
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

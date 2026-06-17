const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { parse } = require('csv-parse/sync');
const { scanDirectory, getFilesBySample } = require('../utils/scanner');
const { appendLog } = require('../utils/logger');

function readCsvContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

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

function checkMissingFiles(files) {
  const issues = [];
  const bySample = getFilesBySample(files);
  const allSamples = Array.from(bySample.keys());

  if (allSamples.length > 1) {
    const expectedExts = new Set();
    for (const sFiles of bySample.values()) {
      for (const f of sFiles) {
        expectedExts.add(f.ext);
      }
    }

    for (const [sampleId, sFiles] of bySample) {
      const sampleExts = new Set(sFiles.map((f) => f.ext));
      for (const ext of expectedExts) {
        if (!sampleExts.has(ext)) {
          issues.push({
            type: 'missing_file',
            severity: 'warn',
            sample: sampleId,
            detail: `Missing ${ext} file for sample ${sampleId}`,
          });
        }
      }
    }
  }

  return issues;
}

function checkDuplicateSamples(files) {
  const issues = [];
  const bySample = getFilesBySample(files);

  for (const [sampleId, sFiles] of bySample) {
    const byExt = new Map();
    for (const f of sFiles) {
      if (!byExt.has(f.ext)) byExt.set(f.ext, []);
      byExt.get(f.ext).push(f);
    }

    for (const [ext, extFiles] of byExt) {
      if (extFiles.length > 1) {
        issues.push({
          type: 'duplicate_sample',
          severity: 'warn',
          sample: sampleId,
          detail: `${extFiles.length} ${ext} files for sample ${sampleId}: ${extFiles.map((f) => f.basename).join(', ')}`,
        });
      }
    }
  }

  return issues;
}

function checkEmptyValues(files) {
  const issues = [];

  for (const file of files) {
    if (!file.isDataFile) continue;
    if (!['.csv', '.tsv', '.txt'].includes(file.ext)) continue;

    const records = readCsvContent(file.file);
    if (!records || records.length === 0) continue;

    const columns = Object.keys(records[0]);
    let emptyCount = 0;

    for (const record of records) {
      for (const col of columns) {
        const val = (record[col] || '').toString().trim();
        if (val === '' || val === 'NA' || val === 'N/A' || val === 'null' || val === 'NaN' || val === '-') {
          emptyCount++;
        }
      }
    }

    if (emptyCount > 0) {
      const totalCells = records.length * columns.length;
      const ratio = (emptyCount / totalCells).toFixed(2);
      issues.push({
        type: 'empty_value',
        severity: ratio > 0.3 ? 'error' : 'warn',
        file: file.basename,
        detail: `${emptyCount} empty/anomalous cells out of ${totalCells} (${ratio}) in ${file.basename}`,
      });
    }
  }

  return issues;
}

function checkUnitConsistency(files) {
  const issues = [];

  const unitPatterns = [
    { column: /conc|concentration|amount/i, expectedUnits: ['mg/L', 'ug/mL', 'ng/mL', 'mM', 'uM', 'nM', 'ppm', 'ppb'] },
    { column: /temp|temperature/i, expectedUnits: ['°C', 'C', 'K', '°F'] },
    { column: /weight|mass/i, expectedUnits: ['mg', 'g', 'kg', 'ug'] },
    { column: /volume/i, expectedUnits: ['mL', 'L', 'uL', 'nL'] },
    { column: /time/i, expectedUnits: ['s', 'min', 'h', 'ms'] },
  ];

  const filesWithUnits = new Map();

  for (const file of files) {
    if (!file.isDataFile) continue;
    if (!['.csv', '.tsv', '.txt'].includes(file.ext)) continue;

    const records = readCsvContent(file.file);
    if (!records || records.length === 0) continue;

    const columns = Object.keys(records[0]);

    for (const col of columns) {
      for (const pat of unitPatterns) {
        if (pat.column.test(col)) {
          const unitSet = new Set();
          for (const record of records) {
            const val = (record[col] || '').toString().trim();
            for (const unit of pat.expectedUnits) {
              if (val.endsWith(unit)) {
                unitSet.add(unit);
              }
            }
          }

          if (unitSet.size > 1) {
            const key = `${col}`;
            if (!filesWithUnits.has(key)) filesWithUnits.set(key, new Map());
            for (const u of unitSet) {
              if (!filesWithUnits.get(key).has(u)) filesWithUnits.get(key).set(u, []);
              filesWithUnits.get(key).get(u).push(file.basename);
            }
          }
        }
      }
    }
  }

  for (const [col, unitMap] of filesWithUnits) {
    const units = Array.from(unitMap.keys());
    issues.push({
      type: 'unit_inconsistency',
      severity: 'warn',
      detail: `Column "${col}" has mixed units: ${units.join(', ')} across files`,
    });
  }

  return issues;
}

async function checkCommand(dir, options) {
  const filter = options.filter || null;
  const quiet = options.quiet || false;

  const files = await scanDirectory(dir, filter);

  const missing = checkMissingFiles(files);
  const duplicates = checkDuplicateSamples(files);
  const empties = checkEmptyValues(files);
  const unitIssues = checkUnitConsistency(files);

  const allIssues = [...missing, ...duplicates, ...empties, ...unitIssues];
  const errors = allIssues.filter((i) => i.severity === 'error');
  const warns = allIssues.filter((i) => i.severity === 'warn');

  if (quiet) {
    console.log(`Check: ${allIssues.length} issue(s) | ${errors.length} error(s) | ${warns.length} warning(s)`);
    appendLog({ command: 'check', action: 'complete', detail: `${allIssues.length} issues found` });
    return { total: allIssues.length, errors: errors.length, warns: warns.length, issues: allIssues };
  }

  console.log(chalk.cyan(`\n🔍 Check Results for: ${dir}`));
  console.log(chalk.dim('─'.repeat(60)));

  if (allIssues.length === 0) {
    console.log(chalk.green('✓ No issues found!'));
  } else {
    if (errors.length > 0) {
      console.log(chalk.red(`\n❌ Errors (${errors.length}):`));
      for (const issue of errors) {
        console.log(chalk.red(`  • [${issue.type}] ${issue.detail}`));
      }
    }

    if (warns.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Warnings (${warns.length}):`));
      for (const issue of warns) {
        console.log(chalk.yellow(`  • [${issue.type}] ${issue.detail}`));
      }
    }
  }

  console.log(chalk.dim('─'.repeat(60)));
  console.log(`Total issues: ${chalk.bold(allIssues.length)} | Errors: ${chalk.red(errors.length)} | Warnings: ${chalk.yellow(warns.length)}`);

  appendLog({ command: 'check', action: 'complete', detail: `${allIssues.length} issues: ${errors.length} errors, ${warns.length} warnings` });

  return { total: allIssues.length, errors: errors.length, warns: warns.length, issues: allIssues };
}

module.exports = { checkCommand };

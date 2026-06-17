const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { parse } = require('csv-parse/sync');
const { scanDirectory, getFilesBySample, getFilesByDate, initializeConfig } = require('../utils/scanner');
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
    const emptyByCol = new Map();

    for (const record of records) {
      for (const col of columns) {
        const val = (record[col] || '').toString().trim();
        if (val === '' || val === 'NA' || val === 'N/A' || val === 'null' || val === 'NaN' || val === '-') {
          emptyCount++;
          emptyByCol.set(col, (emptyByCol.get(col) || 0) + 1);
        }
      }
    }

    if (emptyCount > 0) {
      const totalCells = records.length * columns.length;
      const ratio = (emptyCount / totalCells).toFixed(2);
      const topCols = [...emptyByCol.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c, n]) => `${c}:${n}`)
        .join(', ');
      issues.push({
        type: 'empty_value',
        severity: ratio > 0.3 ? 'error' : 'warn',
        file: file.basename,
        detail: `${emptyCount} empty/anomalous cells out of ${totalCells} (${ratio}) in ${file.basename}. Top columns: ${topCols}`,
      });
    }
  }

  return issues;
}

const UNIT_RULES = [
  { columnTest: /conc|concentration|amount/i, label: 'concentration/amount', units: ['mg/L', 'ug/mL', 'ng/mL', 'mM', 'uM', 'nM', 'ppm', 'ppb', 'g/L', 'μg/mL', 'mg/mL'] },
  { columnTest: /temp|temperature/i, label: 'temperature', units: ['°C', 'C', 'K', '°F', 'F'] },
  { columnTest: /weight|mass/i, label: 'weight/mass', units: ['mg', 'g', 'kg', 'ug', 'μg', 'ng'] },
  { columnTest: /volume/i, label: 'volume', units: ['mL', 'L', 'uL', 'μL', 'nL', 'pL'] },
  { columnTest: /time/i, label: 'time', units: ['s', 'sec', 'min', 'h', 'hr', 'ms'] },
  { columnTest: /pressure/i, label: 'pressure', units: ['Pa', 'kPa', 'MPa', 'bar', 'atm', 'psi', 'mmHg'] },
  { columnTest: /ph|pH/, label: 'pH', units: [] },
  { columnTest: /wavelength|nm/i, label: 'wavelength', units: ['nm', 'μm', 'um'] },
  { columnTest: /absorbance|abs|od/i, label: 'absorbance/OD', units: [] },
  { columnTest: /intensity|signal|count/i, label: 'intensity/signal', units: ['cps', 'AU'] },
];

function extractUnitsFromValue(val, candidateUnits) {
  const s = String(val || '').trim();
  if (!s) return null;
  const sorted = [...candidateUnits].sort((a, b) => b.length - a.length);
  for (const u of sorted) {
    if (!u) continue;
    if (s === u) return u;
    if (s.endsWith(u)) return u;
    const lower = s.toLowerCase();
    const uLower = u.toLowerCase();
    if (lower.endsWith(uLower)) return u;
  }
  const m = s.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*([A-Za-zμ°Ω%]+\/?[A-Za-zμ°]*)$/);
  if (m && m[1]) return m[1];
  return null;
}

function checkUnitConsistency(files) {
  const issues = [];

  const dataFiles = files.filter((f) => f.isDataFile && ['.csv', '.tsv', '.txt'].includes(f.ext));

  const columnIndex = new Map();

  for (const file of dataFiles) {
    const records = readCsvContent(file.file);
    if (!records || records.length === 0) continue;
    const columns = Object.keys(records[0]);

    for (const col of columns) {
      let matchedRule = null;
      for (const rule of UNIT_RULES) {
        if (rule.columnTest.test(col)) {
          matchedRule = rule;
          break;
        }
      }
      if (!matchedRule) continue;

      if (!columnIndex.has(col)) {
        columnIndex.set(col, {
          label: matchedRule.label,
          unitMap: new Map(),
        });
      }

      const entry = columnIndex.get(col);
      for (const record of records) {
        const unit = extractUnitsFromValue(record[col], matchedRule.units);
        if (!unit) continue;
        if (!entry.unitMap.has(unit)) entry.unitMap.set(unit, new Set());
        entry.unitMap.get(unit).add(file.basename);
      }
    }
  }

  for (const [col, data] of columnIndex) {
    if (data.unitMap.size > 1) {
      const unitList = [...data.unitMap.entries()].map(([u, fs]) => ({
        unit: u,
        files: [...fs].sort(),
      }));
      unitList.sort((a, b) => a.unit.localeCompare(b.unit));
      const breakdown = unitList.map((u) => {
        const fStr = u.files.length <= 5 ? u.files.join(', ') : `${u.files.slice(0, 5).join(', ')} ... (+${u.files.length - 5})`;
        return `${u.unit} in [${fStr}]`;
      }).join('; ');
      issues.push({
        type: 'unit_inconsistency',
        severity: 'warn',
        column: col,
        label: data.label,
        unitList,
        detail: `Column "${col}" (${data.label}) has mixed units across files: ${breakdown}`,
      });
    }
  }

  return issues;
}

async function checkCommand(dir, options) {
  const filter = options.filter || null;
  const quiet = options.quiet || false;

  initializeConfig(dir);

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
        if (issue.type === 'unit_inconsistency' && issue.unitList) {
          console.log(chalk.yellow(`  • [unit_inconsistency] Column "${issue.column}" (${issue.label}):`));
          for (const u of issue.unitList) {
            const fStr = u.files.join(', ');
            console.log(chalk.dim(`      - ${u.unit}: ${fStr}`));
          }
        } else {
          console.log(chalk.yellow(`  • [${issue.type}] ${issue.detail}`));
        }
      }
    }
  }

  console.log(chalk.dim('─'.repeat(60)));
  console.log(`Total issues: ${chalk.bold(allIssues.length)} | Errors: ${chalk.red(errors.length)} | Warnings: ${chalk.yellow(warns.length)}`);

  appendLog({ command: 'check', action: 'complete', detail: `${allIssues.length} issues: ${errors.length} errors, ${warns.length} warnings` });

  return { total: allIssues.length, errors: errors.length, warns: warns.length, issues: allIssues };
}

module.exports = { checkCommand };

const chalk = require('chalk');
const path = require('path');
const { loadConfig, CONFIG_NAMES, findConfigFile } = require('../utils/config');
const {
  applyConfig,
  resetPatterns,
  getActiveConfig,
  extractSampleId,
  extractDate,
  extractInstrument,
  DEFAULT_SAMPLE_PATTERNS,
  DEFAULT_DATE_PATTERNS,
  DEFAULT_INSTRUMENT_KEYWORDS,
  DEFAULT_DATA_EXTENSIONS,
} = require('../utils/patterns');
const { appendLog } = require('../utils/logger');

const DEFAULT_PREVIEW = [
  'S-001_2024-01-15_HPLC.csv',
  'sample_004_UV-Vis_20240116.csv',
  'EXP-1001_PlateReader_15_01_2024.csv',
  'S-002_20240115_GC-MS.csv',
  'random_notes.txt',
];

function regexToSource(regex) {
  if (regex instanceof RegExp) return regex.toString();
  return String(regex);
}

async function validateCommand(options) {
  const quiet = options.quiet || false;
  const searchDir = options.dir ? path.resolve(options.dir) : process.cwd();
  const previewList = options.preview
    ? String(options.preview).split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_PREVIEW;

  let cfg = null;
  let cfgPath = null;
  let error = null;

  try {
    cfgPath = findConfigFile(searchDir);
    if (cfgPath) {
      cfg = loadConfig(searchDir);
    }
  } catch (err) {
    error = err.message;
  }

  resetPatterns();
  if (cfg && !error) {
    applyConfig(cfg);
  } else {
    applyConfig(null);
  }
  const active = getActiveConfig();
  const mergeDefault = cfg ? cfg.mergeDefault !== false : true;

  if (quiet) {
    const status = error ? chalk.red('ERROR') : (cfgPath ? chalk.green('OK') : chalk.blue('DEFAULT'));
    const src = cfgPath ? cfgPath : '(built-in defaults)';
    console.log(`Validate: config ${status} — ${src}`);
    appendLog({ command: 'validate', action: 'complete', detail: error ? `error: ${error}` : (cfgPath ? `using ${cfgPath}` : 'using defaults') });
    return { error, configPath: cfgPath, usedDefaults: !cfgPath };
  }

  console.log(chalk.cyan('\n🔎 labkit Rules Validation'));
  console.log(chalk.dim('═'.repeat(60)));

  console.log(chalk.bold('\n📁 Config Source'));
  console.log(chalk.dim('─'.repeat(40)));

  if (error) {
    console.log(chalk.red(`  ✗ Config error: ${error}`));
    console.log(chalk.dim(`  Searched in: ${searchDir} and parents`));
    console.log(chalk.dim(`  Supported names: ${CONFIG_NAMES.join(', ')}`));
    appendLog({ command: 'validate', action: 'error', detail: error });
    return { error, configPath: cfgPath, usedDefaults: !cfgPath };
  }

  if (cfgPath) {
    console.log(chalk.green(`  ✓ Loaded custom config: ${cfgPath}`));
    console.log(chalk.dim(`  Merge with defaults: ${mergeDefault ? 'yes' : 'no (custom only)'}`));
  } else {
    console.log(chalk.blue(`  ℹ  No config file found; using built-in defaults.`));
    console.log(chalk.dim(`  Searched in: ${searchDir} and parents`));
    console.log(chalk.dim(`  Create one of: ${CONFIG_NAMES.join(', ')} to customize rules.`));
  }

  console.log(chalk.bold('\n🧪 Sample ID Patterns'));
  console.log(chalk.dim('─'.repeat(40)));
  for (const pat of active.samplePatterns) {
    const src = regexToSource(pat.regex);
    const cg = typeof pat.captureGroup === 'number' ? ` capture=${pat.captureGroup}` : '';
    const custom = DEFAULT_SAMPLE_PATTERNS.some((d) => d.group === pat.group && d.regex.toString() === pat.regex.toString()) ? '' : chalk.blue(' (custom)');
    console.log(`  • [${pat.group}]${custom} ${src}${cg ? chalk.dim(cg) : ''}`);
  }

  console.log(chalk.bold('\n📅 Date Patterns'));
  console.log(chalk.dim('─'.repeat(40)));
  for (const pat of active.datePatterns) {
    const src = regexToSource(pat.regex);
    const order = pat.order ? ` order=[${pat.order.join(',')}]` : '';
    const custom = DEFAULT_DATE_PATTERNS.some((d) => d.format === pat.format && d.regex.toString() === pat.regex.toString()) ? '' : chalk.blue(' (custom)');
    console.log(`  • [${pat.format}]${custom} ${src}${order ? chalk.dim(order) : ''}`);
  }

  console.log(chalk.bold('\n🔬 Instrument Aliases'));
  console.log(chalk.dim('─'.repeat(40)));
  for (const entry of active.instrumentMap) {
    const defaultAliases = DEFAULT_INSTRUMENT_KEYWORDS[entry.name] || [];
    const customAliases = entry.aliases.filter((a) => !defaultAliases.includes(a.toLowerCase()));
    const suffix = customAliases.length > 0 ? chalk.blue(` (+${customAliases.length} custom: ${customAliases.join(', ')})`) : '';
    console.log(`  • ${entry.name}: ${entry.aliases.join(', ')}${suffix}`);
  }

  console.log(chalk.bold('\n📄 Data Extensions'));
  console.log(chalk.dim('─'.repeat(40)));
  const extArr = [...active.dataExtensions].sort();
  const customExts = extArr.filter((e) => !DEFAULT_DATA_EXTENSIONS.has(e));
  const extSuffix = customExts.length > 0 ? chalk.blue(` (+${customExts.length} custom: ${customExts.join(', ')})`) : '';
  console.log(`  ${extArr.join(', ')}${extSuffix}`);

  console.log(chalk.bold('\n🎯 Filename Recognition Preview'));
  console.log(chalk.dim('─'.repeat(40)));

  for (const fn of previewList) {
    const sample = extractSampleId(fn);
    const date = extractDate(fn);
    const inst = extractInstrument(fn);
    const parts = [];
    parts.push(sample ? chalk.green(`sample=${sample.id}`) : chalk.red('sample=?'));
    parts.push(date ? chalk.green(`date=${date.iso}`) : chalk.red('date=?'));
    parts.push(inst ? chalk.green(`instrument=${inst}`) : chalk.red('instrument=?'));
    console.log(`  ${chalk.bold(fn)}`);
    console.log(chalk.dim(`    → ${parts.join('  ')}`));
  }

  console.log(chalk.dim('\n═'.repeat(60)));
  console.log(chalk.green(`  ✓ Rules validated. ${active.samplePatterns.length} sample patterns · ${active.datePatterns.length} date patterns · ${active.instrumentMap.length} instruments.`));

  appendLog({
    command: 'validate',
    action: 'complete',
    detail: cfgPath ? `using ${cfgPath}` : 'using defaults',
  });

  return { error: null, configPath: cfgPath, usedDefaults: !cfgPath };
}

module.exports = { validateCommand };

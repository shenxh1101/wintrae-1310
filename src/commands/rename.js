const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { scanDirectory } = require('../utils/scanner');
const { appendLog } = require('../utils/logger');

function generateNewName(file) {
  const parts = [];

  if (file.sampleId) {
    parts.push(file.sampleId);
  } else {
    parts.push('UNKNOWN');
  }

  if (file.date) {
    parts.push(file.date);
  }

  if (file.instrument) {
    parts.push(file.instrument);
  }

  if (parts.length === 0) {
    return null;
  }

  const newName = parts.join('_') + file.ext;
  return newName;
}

async function renameCommand(dir, options) {
  const filter = options.filter || null;
  const dryRun = options.dryRun || false;
  const quiet = options.quiet || false;

  const files = await scanDirectory(dir, filter);
  const plans = [];

  for (const file of files) {
    const newName = generateNewName(file);
    if (!newName) continue;

    if (newName === file.basename) continue;

    const newPath = path.join(path.dirname(file.file), newName);
    plans.push({
      oldPath: file.file,
      newPath,
      oldName: file.basename,
      newName,
      sampleId: file.sampleId,
      date: file.date,
      instrument: file.instrument,
    });
  }

  if (quiet) {
    console.log(`Rename: ${plans.length} file(s) to rename${dryRun ? ' (dry-run)' : ''}`);
    appendLog({ command: 'rename', action: dryRun ? 'preview' : 'complete', detail: `${plans.length} renames` });
    return { count: plans.length, dryRun, plans };
  }

  if (plans.length === 0) {
    console.log(chalk.yellow('No files need renaming.'));
    appendLog({ command: 'rename', action: 'skip', detail: 'no renames needed' });
    return { count: 0, dryRun, plans: [] };
  }

  const label = dryRun ? chalk.yellow('🔍 Rename Preview (dry-run)') : chalk.cyan('✏️  Renaming Files');
  console.log(label);
  console.log(chalk.dim('─'.repeat(60)));

  for (const plan of plans) {
    if (dryRun) {
      console.log(`  ${chalk.red(plan.oldName)} → ${chalk.green(plan.newName)}`);
    } else {
      try {
        if (fs.existsSync(plan.newPath)) {
          console.log(chalk.yellow(`  ⚠ Skip (target exists): ${plan.oldName} → ${plan.newName}`));
          plan.skipped = true;
          continue;
        }
        fs.renameSync(plan.oldPath, plan.newPath);
        console.log(`  ${chalk.green('✓')} ${plan.oldName} → ${plan.newName}`);
        plan.applied = true;
      } catch (err) {
        console.log(chalk.red(`  ✗ ${plan.oldName}: ${err.message}`));
        plan.error = err.message;
      }
    }
  }

  const applied = plans.filter((p) => p.applied).length;
  const skipped = plans.filter((p) => p.skipped).length;
  const errored = plans.filter((p) => p.error).length;

  console.log(chalk.dim('─'.repeat(60)));
  if (dryRun) {
    console.log(chalk.yellow(`Preview: ${plans.length} rename(s) would be applied`));
  } else {
    console.log(`Applied: ${chalk.green(applied)} | Skipped: ${chalk.yellow(skipped)} | Errors: ${chalk.red(errored)}`);
  }

  appendLog({
    command: 'rename',
    action: dryRun ? 'preview' : 'complete',
    detail: `${plans.length} planned, ${applied} applied, ${skipped} skipped, ${errored} errors`,
  });

  return { count: plans.length, applied, skipped, errored, dryRun, plans };
}

module.exports = { renameCommand };

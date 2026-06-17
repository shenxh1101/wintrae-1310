const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), '.labkit');
const LOG_FILE = path.join(LOG_DIR, 'labkit.log');

let DRY_RUN_MODE = false;

function setDryRunMode(enabled) {
  DRY_RUN_MODE = !!enabled;
}

function isDryRun() {
  return DRY_RUN_MODE;
}

function ensureLogDir() {
  if (DRY_RUN_MODE) return false;
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  return true;
}

function appendLog(entry) {
  if (DRY_RUN_MODE) return false;
  if (!ensureLogDir()) return false;
  const line = `${new Date().toISOString()} | ${entry.command} | ${entry.action} | ${entry.detail || ''}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
  return true;
}

function readLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  return content.trim().split('\n').filter(Boolean).map((line) => {
    const parts = line.split(' | ');
    return {
      timestamp: parts[0] || '',
      command: parts[1] || '',
      action: parts[2] || '',
      detail: parts.slice(3).join(' | ') || '',
    };
  });
}

function clearLog() {
  if (DRY_RUN_MODE) return false;
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
    return true;
  }
  return false;
}

module.exports = {
  appendLog,
  readLog,
  clearLog,
  setDryRunMode,
  isDryRun,
  ensureLogDir,
  LOG_DIR,
  LOG_FILE,
};

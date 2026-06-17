const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), '.labkit');
const LOG_FILE = path.join(LOG_DIR, 'labkit.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function appendLog(entry) {
  ensureLogDir();
  const line = `${new Date().toISOString()} | ${entry.command} | ${entry.action} | ${entry.detail || ''}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
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
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }
}

module.exports = {
  appendLog,
  readLog,
  clearLog,
  LOG_DIR,
  LOG_FILE,
};

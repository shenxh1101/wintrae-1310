const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { extractSampleId, extractDate, extractInstrument, getDataExtensions, getActiveConfig, resetPatterns, applyConfig } = require('./patterns');
const { loadConfig } = require('./config');

let configLoaded = null;

function initializeConfig(dir) {
  resetPatterns();
  try {
    const cfg = loadConfig(dir);
    if (cfg) {
      applyConfig(cfg);
      configLoaded = cfg.filePath;
    } else {
      configLoaded = null;
      applyConfig(null);
    }
    return configLoaded;
  } catch (err) {
    applyConfig(null);
    configLoaded = null;
    throw err;
  }
}

function getLoadedConfigPath() {
  return configLoaded;
}

async function scanDirectory(dir, filter) {
  if (configLoaded === null) {
    initializeConfig(dir);
  }

  const pattern = filter || '**/*';
  const files = await glob(pattern, { cwd: dir, absolute: true, nodir: true });

  const dataExtensions = getDataExtensions();
  const results = [];

  for (const filePath of files) {
    const basename = path.basename(filePath);
    const ext = path.extname(basename).toLowerCase();
    const stat = fs.statSync(filePath);

    const sampleInfo = extractSampleId(basename);
    const dateInfo = extractDate(basename);
    const instrument = extractInstrument(basename);

    results.push({
      file: filePath,
      basename,
      ext,
      size: stat.size,
      mtime: stat.mtime,
      sampleId: sampleInfo ? sampleInfo.id : null,
      sampleGroup: sampleInfo ? sampleInfo.group : null,
      date: dateInfo ? dateInfo.iso : null,
      dateRaw: dateInfo ? dateInfo.raw : null,
      dateFormat: dateInfo ? dateInfo.format : null,
      instrument: instrument || null,
      isDataFile: dataExtensions.has(ext),
    });
  }

  return results;
}

function getFilesBySample(files) {
  const map = new Map();
  for (const f of files) {
    if (f.sampleId) {
      if (!map.has(f.sampleId)) map.set(f.sampleId, []);
      map.get(f.sampleId).push(f);
    }
  }
  return map;
}

function getFilesByDate(files) {
  const map = new Map();
  for (const f of files) {
    if (f.date) {
      if (!map.has(f.date)) map.set(f.date, []);
      map.get(f.date).push(f);
    }
  }
  return map;
}

function getFilesByInstrument(files) {
  const map = new Map();
  for (const f of files) {
    if (f.instrument) {
      if (!map.has(f.instrument)) map.set(f.instrument, []);
      map.get(f.instrument).push(f);
    }
  }
  return map;
}

module.exports = {
  scanDirectory,
  getFilesBySample,
  getFilesByDate,
  getFilesByInstrument,
  initializeConfig,
  getLoadedConfigPath,
  getActiveConfig,
};

const fs = require('fs');
const path = require('path');

const CONFIG_NAMES = [
  'labkit.config.json',
  'labkit.rules.json',
  '.labkitrc.json',
];

function findConfigFile(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    for (const name of CONFIG_NAMES) {
      const fp = path.join(dir, name);
      if (fs.existsSync(fp)) return fp;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function validateConfig(cfg, filePath) {
  if (cfg && typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error(`Invalid config format in ${filePath}: must be a JSON object`);
  }

  const out = {
    samplePatterns: null,
    datePatterns: null,
    instrumentAliases: null,
    dataExtensions: null,
  };

  if (cfg.samplePatterns) {
    if (!Array.isArray(cfg.samplePatterns)) {
      throw new Error(`samplePatterns in ${filePath} must be an array`);
    }
    out.samplePatterns = cfg.samplePatterns.map((pat, idx) => {
      if (!pat.regex) throw new Error(`samplePatterns[${idx}] missing "regex" field in ${filePath}`);
      try {
        return {
          regex: new RegExp(pat.regex, pat.flags || 'i'),
          group: pat.group || `custom-${idx}`,
          captureGroup: typeof pat.captureGroup === 'number' ? pat.captureGroup : (pat.regex.startsWith('(?:') ? 1 : 0),
        };
      } catch (err) {
        throw new Error(`samplePatterns[${idx}] invalid regex: ${err.message}`);
      }
    });
  }

  if (cfg.datePatterns) {
    if (!Array.isArray(cfg.datePatterns)) {
      throw new Error(`datePatterns in ${filePath} must be an array`);
    }
    out.datePatterns = cfg.datePatterns.map((pat, idx) => {
      if (!pat.regex) throw new Error(`datePatterns[${idx}] missing "regex" field in ${filePath}`);
      if (!pat.format) throw new Error(`datePatterns[${idx}] missing "format" field in ${filePath}`);
      try {
        return {
          regex: new RegExp(pat.regex, pat.flags || ''),
          format: pat.format,
          order: pat.order || null,
        };
      } catch (err) {
        throw new Error(`datePatterns[${idx}] invalid regex: ${err.message}`);
      }
    });
  }

  if (cfg.instrumentAliases) {
    if (typeof cfg.instrumentAliases !== 'object' || Array.isArray(cfg.instrumentAliases)) {
      throw new Error(`instrumentAliases in ${filePath} must be an object`);
    }
    out.instrumentAliases = {};
    for (const [name, aliases] of Object.entries(cfg.instrumentAliases)) {
      if (!Array.isArray(aliases)) {
        throw new Error(`instrumentAliases["${name}"] in ${filePath} must be an array of strings`);
      }
      out.instrumentAliases[name] = aliases.map(String);
    }
  }

  if (cfg.dataExtensions) {
    if (!Array.isArray(cfg.dataExtensions)) {
      throw new Error(`dataExtensions in ${filePath} must be an array`);
    }
    out.dataExtensions = cfg.dataExtensions.map((e) => {
      const s = String(e);
      return s.startsWith('.') ? s.toLowerCase() : `.${s.toLowerCase()}`;
    });
  }

  out.mergeDefault = cfg.mergeDefault !== false;
  return out;
}

function loadConfig(targetDir) {
  const fp = findConfigFile(targetDir);
  if (!fp) return null;

  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const json = JSON.parse(raw);
    const parsed = validateConfig(json, fp);
    parsed.filePath = fp;
    return parsed;
  } catch (err) {
    throw new Error(`Failed to load config ${fp}: ${err.message}`);
  }
}

module.exports = {
  loadConfig,
  findConfigFile,
  validateConfig,
  CONFIG_NAMES,
};

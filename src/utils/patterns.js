const DEFAULT_SAMPLE_PATTERNS = [
  { regex: /(?:^|[-_\s])([Ss][Aa][Mm][Pp][Ll][Ee]\s*[-_]?(\d{3,6}))/, group: 'SAMPLE-NNN', captureGroup: 1 },
  { regex: /(?:^|[-_\s])([Ss][Aa][Mm]\s*[-_]?(\d{3,6}))/, group: 'SAM-NNN', captureGroup: 1 },
  { regex: /(?:^|[-_\s])([Ss][-_](\d{3,6}))/, group: 'S-NNN', captureGroup: 1 },
  { regex: /(\d{4})[-_]?[Ss]([Aa]\d+)?/, group: 'YYYY-Sxx', captureGroup: 0 },
];

const DEFAULT_DATE_PATTERNS = [
  { regex: /(\d{4})[-](\d{2})[-](\d{2})/, format: 'YYYY-MM-DD', order: ['year', 'month', 'day'] },
  { regex: /(\d{4})(\d{2})(\d{2})/, format: 'YYYYMMDD', order: ['year', 'month', 'day'] },
  { regex: /(\d{2})[-](\d{2})[-](\d{4})/, format: 'MM-DD-YYYY', order: ['month', 'day', 'year'] },
];

const DEFAULT_INSTRUMENT_KEYWORDS = {
  HPLC: ['hplc', 'lc-ms', 'lcms'],
  'GC-MS': ['gc-ms', 'gcms', 'gc'],
  NMR: ['nmr'],
  PCR: ['pcr', 'qpcr', 'rt-pcr'],
  ELISA: ['elisa'],
  'UV-Vis': ['uv', 'uv-vis', 'uvvis'],
  FTIR: ['ftir', 'ir', 'ir-spect'],
  Microscope: ['micro', 'microscope', 'confocal'],
  FlowCytometry: ['flow', 'facs', 'cytometry'],
  Spectrophotometer: ['spectro', 'spectra', 'spec'],
  XRD: ['xrd'],
  SEM: ['sem'],
  TEM: ['tem'],
};

const DEFAULT_DATA_EXTENSIONS = new Set([
  '.csv', '.tsv', '.xlsx', '.xls', '.json', '.dat', '.txt',
]);

let compiledSamplePatterns = null;
let compiledDatePatterns = null;
let compiledInstrumentMap = null;
let compiledDataExtensions = null;
let activeConfigPath = null;

function compileInstrumentMap(base, custom) {
  const merged = Object.assign({}, base);
  if (custom) {
    for (const [name, aliases] of Object.entries(custom)) {
      const existing = merged[name] ? [...merged[name]] : [];
      const set = new Set([...existing.map((a) => a.toLowerCase()), ...aliases.map((a) => a.toLowerCase())]);
      merged[name] = Array.from(set);
    }
  }
  const entries = Object.entries(merged).map(([name, aliases]) => ({ name, aliases }));
  entries.sort((a, b) => {
    const al = Math.max(...b.aliases.map((s) => s.length));
    const bl = Math.max(...a.aliases.map((s) => s.length));
    return bl - al;
  });
  return entries;
}

function applyConfig(cfg) {
  const samplePatterns = cfg && cfg.samplePatterns ? cfg.samplePatterns : [];
  const datePatterns = cfg && cfg.datePatterns ? cfg.datePatterns : [];
  const instrumentAliases = cfg && cfg.instrumentAliases ? cfg.instrumentAliases : null;
  const dataExtensions = cfg && cfg.dataExtensions ? cfg.dataExtensions : null;
  const mergeDefault = cfg ? cfg.mergeDefault !== false : true;

  compiledSamplePatterns = mergeDefault ? [...samplePatterns, ...DEFAULT_SAMPLE_PATTERNS] : samplePatterns;
  compiledDatePatterns = mergeDefault ? [...datePatterns, ...DEFAULT_DATE_PATTERNS] : datePatterns;
  compiledInstrumentMap = compileInstrumentMap(DEFAULT_INSTRUMENT_KEYWORDS, instrumentAliases);
  compiledDataExtensions = dataExtensions ? new Set([...dataExtensions, ...(mergeDefault ? DEFAULT_DATA_EXTENSIONS : [])]) : DEFAULT_DATA_EXTENSIONS;
  activeConfigPath = cfg ? cfg.filePath : null;
}

function ensureCompiled() {
  if (!compiledSamplePatterns) {
    applyConfig(null);
  }
}

function getActiveConfig() {
  ensureCompiled();
  return {
    filePath: activeConfigPath,
    samplePatterns: compiledSamplePatterns,
    datePatterns: compiledDatePatterns,
    instrumentMap: compiledInstrumentMap,
    dataExtensions: compiledDataExtensions,
  };
}

function resetPatterns() {
  compiledSamplePatterns = null;
  compiledDatePatterns = null;
  compiledInstrumentMap = null;
  compiledDataExtensions = null;
  activeConfigPath = null;
}

function extractSampleId(filename) {
  ensureCompiled();
  for (const pat of compiledSamplePatterns) {
    const match = filename.match(pat.regex);
    if (match) {
      const cg = pat.captureGroup || 0;
      const raw = (cg > 0 && match[cg]) ? match[cg] : match[0];
      const id = raw.toUpperCase().replace(/\s+/g, '-');
      return { id, group: pat.group };
    }
  }
  return null;
}

function formatDateFromGroups(match, pattern) {
  const order = pattern.order || [];
  if (order.length === 3) {
    const vals = {};
    order.forEach((k, i) => { vals[k] = match[i + 1]; });
    if (vals.year && vals.month && vals.day) {
      return {
        raw: match[0],
        iso: `${vals.year}-${vals.month}-${vals.day}`,
        format: pattern.format,
      };
    }
  }
  if (pattern.format === 'YYYY-MM-DD' && match[1] && match[2] && match[3]) {
    return { raw: match[0], iso: match[0], format: pattern.format };
  }
  if (pattern.format === 'YYYYMMDD' && match[1] && match[2] && match[3]) {
    return { raw: match[0], iso: `${match[1]}-${match[2]}-${match[3]}`, format: pattern.format };
  }
  if (pattern.format === 'MM-DD-YYYY' && match[1] && match[2] && match[3]) {
    return { raw: match[0], iso: `${match[3]}-${match[1]}-${match[2]}`, format: pattern.format };
  }
  return null;
}

function extractDate(filename) {
  ensureCompiled();
  for (const pat of compiledDatePatterns) {
    const match = filename.match(pat.regex);
    if (match) {
      const result = formatDateFromGroups(match, pat);
      if (result) return result;
    }
  }
  return null;
}

function extractInstrument(filename) {
  ensureCompiled();
  const lower = filename.toLowerCase();
  for (const entry of compiledInstrumentMap) {
    for (const kw of entry.aliases) {
      if (kw === '') continue;
      if (lower.includes(kw)) {
        return entry.name;
      }
    }
  }
  return null;
}

function getDataExtensions() {
  ensureCompiled();
  return compiledDataExtensions;
}

module.exports = {
  DEFAULT_SAMPLE_PATTERNS,
  DEFAULT_DATE_PATTERNS,
  DEFAULT_INSTRUMENT_KEYWORDS,
  DEFAULT_DATA_EXTENSIONS,
  SAMPLE_PATTERNS: DEFAULT_SAMPLE_PATTERNS,
  DATE_PATTERNS: DEFAULT_DATE_PATTERNS,
  INSTRUMENT_KEYWORDS: DEFAULT_INSTRUMENT_KEYWORDS,
  DATA_EXTENSIONS: DEFAULT_DATA_EXTENSIONS,
  applyConfig,
  getActiveConfig,
  resetPatterns,
  extractSampleId,
  extractDate,
  extractInstrument,
  getDataExtensions,
};

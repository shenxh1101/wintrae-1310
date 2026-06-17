const SAMPLE_PATTERNS = [
  { regex: /(?:^|[-_\s])([Ss][Aa][Mm][Pp][Ll][Ee]\s*[-_]?(\d{3,6}))/, group: 'SAMPLE-NNN' },
  { regex: /(?:^|[-_\s])([Ss][Aa][Mm]\s*[-_]?(\d{3,6}))/, group: 'SAM-NNN' },
  { regex: /(?:^|[-_\s])([Ss][-_](\d{3,6}))/, group: 'S-NNN' },
  { regex: /(\d{4})[-_]?[Ss]([Aa]\d+)?/, group: 'YYYY-Sxx' },
];

const DATE_PATTERNS = [
  { regex: /(\d{4})[-](\d{2})[-](\d{2})/, format: 'YYYY-MM-DD' },
  { regex: /(\d{4})(\d{2})(\d{2})/, format: 'YYYYMMDD' },
  { regex: /(\d{2})[-](\d{2})[-](\d{4})/, format: 'MM-DD-YYYY' },
];

const INSTRUMENT_KEYWORDS = {
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

const DATA_EXTENSIONS = new Set([
  '.csv', '.tsv', '.xlsx', '.xls', '.json', '.dat', '.txt',
]);

function extractSampleId(filename) {
  for (const pat of SAMPLE_PATTERNS) {
    const match = filename.match(pat.regex);
    if (match) {
      const id = match[1] ? match[1].toUpperCase().replace(/\s+/g, '-') : match[0].toUpperCase().replace(/\s+/g, '-');
      return { id, group: pat.group };
    }
  }
  return null;
}

function extractDate(filename) {
  for (const pat of DATE_PATTERNS) {
    const match = filename.match(pat.regex);
    if (match) {
      if (pat.format === 'YYYY-MM-DD') {
        return { raw: match[0], iso: match[0], format: pat.format };
      }
      if (pat.format === 'YYYYMMDD') {
        const iso = `${match[1]}-${match[2]}-${match[3]}`;
        return { raw: match[0], iso, format: pat.format };
      }
      if (pat.format === 'MM-DD-YYYY') {
        const iso = `${match[3]}-${match[1]}-${match[2]}`;
        return { raw: match[0], iso, format: pat.format };
      }
    }
  }
  return null;
}

function extractInstrument(filename) {
  const lower = filename.toLowerCase();
  for (const [instrument, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return instrument;
      }
    }
  }
  return null;
}

module.exports = {
  SAMPLE_PATTERNS,
  DATE_PATTERNS,
  INSTRUMENT_KEYWORDS,
  DATA_EXTENSIONS,
  extractSampleId,
  extractDate,
  extractInstrument,
};

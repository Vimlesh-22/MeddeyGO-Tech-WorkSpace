const { COMPANY_NAMES } = require('../config');

function normalize(str) {
  return String(str || '').toLowerCase();
}

function scoreCompany(company, { filename = '', rows = [] }) {
  const lcCompany = normalize(company);
  let score = 0;
  let evidence = [];

  if (normalize(filename).includes(lcCompany)) {
    score += 50;
    evidence.push('filename');
  }

  if (rows && rows.length) {
    const firstRows = rows.slice(0, 50);
    const joined = firstRows.map((row) => Object.values(row || {}).join(' ').toLowerCase());
    for (const rowStr of joined) {
      if (rowStr.includes(lcCompany)) {
        score += 20;
        evidence.push('data');
        break;
      }
    }
  }

  return { company, score, evidence };
}

function detectCompany(filename, rows) {
  const candidates = COMPANY_NAMES.map((name) => scoreCompany(name, { filename, rows }));
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score === 0) {
    return { company: COMPANY_NAMES[0], confidence: 10, source: 'default' };
  }
  const confidence = Math.min(100, best.score);
  const source = best.evidence.length ? best.evidence.join('+') : 'default';
  return { company: best.company, confidence, source };
}

module.exports = { detectCompany };

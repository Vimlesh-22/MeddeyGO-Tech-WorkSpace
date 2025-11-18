const { parse, isValid, addDays, format } = require('date-fns');

// Try to detect date from filename: comprehensive patterns ported from Python
function detectDateFromFilename(filename) {
  if (!filename) return null;
  const name = filename.replace(/\.[^.]+$/, '');
  
  const monthMap = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2,
    'mar': 3, 'march': 3, 'apr': 4, 'april': 4,
    'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
    'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10, 'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };
  
  const patterns = [
    // DD_MM_YYYY or DD-MM-YYYY
    /(\d{1,2})[_\-](\d{1,2})[_\-](\d{4})/, 
    // YYYY_MM_DD or YYYY-MM-DD
    /(\d{4})[_\-](\d{1,2})[_\-](\d{1,2})/,
    // 29_jan_2025 or 29_january_2025 (all 12 months)
    /(\d{1,2})[_\- ]*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[_\- ]*(\d{2,4})/i
  ];

  for (const p of patterns) {
    const m = name.match(p);
    if (m) {
      try {
        if (p === patterns[0]) {
          // DD_MM_YYYY
          const day = Number(m[1]);
          const month = Number(m[2]);
          const year = Number(m[3]);
          const d = new Date(year, month - 1, day);
          if (isValid(d)) return d;
        } else if (p === patterns[1]) {
          // YYYY_MM_DD
          const year = Number(m[1]);
          const month = Number(m[2]);
          const day = Number(m[3]);
          const d = new Date(year, month - 1, day);
          if (isValid(d)) return d;
        } else {
          // month name pattern
          const day = Number(m[1]);
          const mon = m[2].toLowerCase();
          let year = Number(m[3]);
          if (year < 100) {
            year = year < 50 ? 2000 + year : 1900 + year;
          }
          const monthIdx = Object.keys(monthMap).findIndex(x => mon.startsWith(x));
          if (monthIdx >= 0) {
            const month = monthMap[Object.keys(monthMap)[monthIdx]];
            const d = new Date(year, month - 1, day);
            if (isValid(d)) return d;
          }
        }
      } catch (e) {
        continue;
      }
    }
  }

  return null;
}

// Extract date from existing Google Sheet tab name
// Examples: "OCT 7 Meddeygo" → Oct 7, 2025
//           "JUL 11 Medansh" → Jul 11, 2025
//           "OCT 5-6 Meddeygo" → Oct 6, 2025 (takes the last date in range)
function extractDateFromTabName(tabName) {
  if (!tabName) return null;
  
  const monthMap = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2,
    'mar': 3, 'march': 3, 'apr': 4, 'april': 4,
    'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
    'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10, 'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };
  
  // Pattern: "MONTH DAY" or "MONTH DAY-DAY"
  // Examples: "OCT 7", "JUL 11", "OCT 5-6"
  const pattern = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})(?:-(\d{1,2}))?/i;
  
  const match = tabName.match(pattern);
  if (match) {
    try {
      const monthName = match[1].toLowerCase();
      const firstDay = parseInt(match[2], 10);
      const lastDay = match[3] ? parseInt(match[3], 10) : firstDay;
      
      const month = Object.keys(monthMap).find(m => monthName.startsWith(m));
      if (month) {
        const monthNum = monthMap[month];
        const year = new Date().getFullYear(); // Use current year as default
        
        // Use the LAST day in the range (for "OCT 5-6", use 6)
        const day = lastDay;
        
        const date = new Date(year, monthNum - 1, day);
        if (isValid(date)) return date;
      }
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

function calculateNewTabName(dateList, companyName) {
  try {
    const days = [];
    for (const d of dateList) {
      if (!d) continue;
      let dateObj = d instanceof Date ? d : new Date(d);
      if (!isValid(dateObj)) continue;
      const plus1 = addDays(dateObj, 1);
      days.push(plus1);
    }
    if (days.length === 0) return null;
    days.sort((a,b) => a - b);
    const month = format(days[0], 'MMM').toUpperCase();
    const uniqueDays = [...new Set(days.map(x => x.getDate()))].sort((a, b) => a - b);
    let formattedDate;
    if (uniqueDays.length === 1) {
      formattedDate = `${month} ${uniqueDays[0]}`;
    } else if (uniqueDays.length === 2) {
      formattedDate = `${month} ${uniqueDays[0]}-${uniqueDays[1]}`;
    } else {
      formattedDate = `${month} ${uniqueDays[0]}-${uniqueDays[uniqueDays.length-1]}`;
    }
    return `${formattedDate} ${companyName}`;
  } catch (e) {
    return null;
  }
}

module.exports = { detectDateFromFilename, extractDateFromTabName, calculateNewTabName };

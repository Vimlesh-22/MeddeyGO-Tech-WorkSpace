const Papa = require('papaparse');
const XLSX = require('xlsx');

// CSV parser wrapper
function parseCSVBuffer(csvString) {
  const { data, errors } = Papa.parse(csvString, { header: true, skipEmptyLines: true });
  if (errors && errors.length) {
    console.warn('CSV parse warnings:', errors.slice(0, 5));
  }
  return data;
}

// Excel parser wrapper
function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  return data;
}

// Enhanced product extraction with comprehensive patterns (ported from Python)
function extractProductFromText(text) {
  if (!text || text === 'null' || text === 'undefined') return null;
  const t = String(text).trim();
  if (t.length < 10) return null;

  // Filter out completely unwanted patterns (order status only)
  const strictUnwanted = [
    /^order\s+(?:confirmed|placed|received|processing)\s*$/i,
    /^(?:shipped|delivered|cancelled|pending)\s*$/i,
    /^\d+\s*$/,
    /^[A-Z]{2,5}\d+\s*$/,
    /^(?:thank\s+you|thanks)\s+for\s+(?:your\s+)?order\s*$/i,
  ];

  for (const unwanted of strictUnwanted) {
    if (unwanted.test(t)) return null;
  }

  // COMPREHENSIVE pattern list with priority scoring
  const patterns = [
    // HIGH PRIORITY (90-100)
    { regex: /(?:left|forgot|still\s+have|abandoned)\s+["'*]?([^"'*\n]{5,100}?)["'*]?\s+in\s+(?:your\s+)?cart/i, confidence: 95 },
    { regex: /cart.*?:\s*["'*]?([^"'*\n]{5,100})["'*]?/i, confidence: 92 },
    { regex: /(?:your\s+)?cart\s+contains?[:\s]+["'*]?([^"'*\n]{5,100})["'*]?/i, confidence: 92 },
    { regex: /(?:product|item)\s+name[:\s]+["'*]?([^"'*\n]{5,100})["'*]?/i, confidence: 98 },
    { regex: /(?:you\s+)?(?:viewed|browsing|checking\s+out|interested\s+in)\s+["'*]?([^"'*\n]{5,100}?)["'*]?\s+(?:on|at)/i, confidence: 94 },
    { regex: /(?:still\s+)?interested\s+in\s+["'*]?([^"'*\n]{5,100})["'*]?/i, confidence: 93 },
    { regex: /["'*]?([^"'*\n]{5,100})["'*]?\s+(?:at|for|@)\s+[₹Rs$]\s*\d+(?:,\d{3})*(?:\.\d{2})?/i, confidence: 96 },
    { regex: /[₹Rs$]\s*\d+(?:,\d{3})*(?:\.\d{2})?\s+(?:for|off\s+on)\s+["'*]?([^"'*\n]{5,100})["'*]?/i, confidence: 96 },
    { regex: /(?:price|cost)[:\s]+[₹Rs$]\s*\d+.*?(?:for|of)\s+["'*]?([^"'*\n]{5,100})["'*]?/i, confidence: 94 },
    { regex: /(?:purchase|order|buying)\s+(?:of\s+)?["'*]?([^"'*\n]{10,100}?)["'*]?\s+(?:could\s+not|failed|unsuccessful|pending)/i, confidence: 88 },
    { regex: /(?:payment|transaction)\s+for\s+["'*]?([^"'*\n]{10,100})["'*]?\s+(?:declined|failed|pending)/i, confidence: 88 },
    { regex: /(?:ordered|purchased|bought)\s+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 86 },
    
    // MEDIUM PRIORITY (70-89)
    { regex: /"([^"]{15,150})"/, confidence: 82 },
    { regex: /'([^']{15,150})'/, confidence: 82 },
    { regex: /\*([^*]{15,150})\*/, confidence: 80 },
    { regex: /(?:product|item)\s+(?:description|details?)[:\s]+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 85 },
    { regex: /(?:looking\s+for|searching\s+for|want\s+to\s+buy)\s+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 83 },
    { regex: /(?:added|saved)\s+["'*]?([^"'*\n]{10,100})["'*]?\s+to\s+(?:wishlist|favorites?|cart)/i, confidence: 87 },
    { regex: /wishlist.*?[:\s]+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 85 },
    { regex: /(?:back\s+in\s+stock|now\s+available|restocked)[:\s]+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 86 },
    { regex: /["'*]?([^"'*\n]{10,100})["'*]?\s+is\s+(?:now\s+)?(?:available|in\s+stock)/i, confidence: 86 },
    { regex: /(?:\d+%\s+off|discount|sale)\s+on\s+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 84 },
    { regex: /["'*]?([^"'*\n]{10,100})["'*]?\s+(?:at|@)\s+\d+%\s+off/i, confidence: 84 },
    
    // LOWER PRIORITY (50-69)
    { regex: /(?:check\s+out|see)\s+(?:our\s+)?["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 72 },
    { regex: /(?:new|latest|trending)[:\s]+["'*]?([^"'*\n]{10,100})["'*]?/i, confidence: 70 },
    { regex: /(?:category|section)[:\s]+["'*]?([^"'*\n]{10,80})["'*]?/i, confidence: 68 },
  ];

  let bestMatch = null;
  let bestScore = 0;

  for (const { regex, confidence } of patterns) {
    const matches = [...t.matchAll(new RegExp(regex.source, 'gi'))];
    for (const match of matches) {
      if (match[1]) {
        let extractedText = match[1].trim();
        
        // Clean up
        extractedText = extractedText.replace(/\s+/g, ' ');
        extractedText = extractedText.replace(/^[,.\-:\s]+|[,.\-:\s]+$/g, '');
        extractedText = extractedText.replace(/\s+([,.])/g, '$1');
        
        // Validation
        if (extractedText.length < 5 || extractedText.length > 150) continue;
        
        // Skip if ONLY unwanted words
        if (/^(?:meddeygo|medansh|order|status|tracking|shipment)$/i.test(extractedText)) continue;
        
        let finalConfidence = confidence;
        
        // Reduce confidence for order/tracking mentions
        if (/order\s+(?:id|number)|tracking|shipment\s+id/i.test(extractedText)) {
          finalConfidence = Math.max(50, confidence - 30);
        }
        
        // Boost for quantity indicators
        if (/\b(?:ml|mg|kg|g|liter|litre|piece|pack|box|bottle|tablet|capsule)\b/i.test(extractedText)) {
          finalConfidence = Math.min(100, confidence + 5);
        }
        if (/\b\d+\s*(?:ml|mg|kg|g|liter|litre|piece|pack|box|bottle|tablet|capsule)\b/i.test(extractedText)) {
          finalConfidence = Math.min(100, confidence + 8);
        }
        
        // Check if better than previous
        if (finalConfidence > bestScore) {
          bestMatch = extractedText;
          bestScore = finalConfidence;
        }
      }
    }
  }

  // Final validation
  if (bestMatch && bestScore >= 60) {
    if (/^(?:Order|Tracking|Shipment)\s+[A-Z0-9]+$/i.test(bestMatch)) return null;
    return bestMatch;
  }

  return null;
}

function extractProductsFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { rows: [], extractedCount: 0, total: 0 };
  }

  // Find text column (case-insensitive)
  let textKey = null;
  const firstRow = rows[0] || {};
  const textColumns = ['text', 'message', 'body', 'content', 'msg'];
  
  for (const key of Object.keys(firstRow)) {
    if (textColumns.includes(key.toLowerCase())) {
      textKey = key;
      break;
    }
  }

  if (!textKey) {
    return { rows: [], extractedCount: 0, total: rows.length, error: 'No text column found. Please ensure your file has a "Text" or "Message" column.' };
  }

  // Extract products
  const processed = rows.map((row) => {
    try {
      const textValue = row && row[textKey] ? String(row[textKey]) : '';
      const product = extractProductFromText(textValue);
      return { row, product };
    } catch (err) {
      console.warn('Error extracting product from row:', err);
      return { row, product: null };
    }
  });

  // Filter to only rows with products
  const extractedRows = processed
    .filter((entry) => entry && entry.product)
    .map((entry) => ({ ...entry.row, 'Product Name': entry.product }));

  // Remove duplicates by phone number
  let phoneKey = null;
  if (extractedRows.length > 0) {
    const firstExtractedRow = extractedRows[0] || {};
    const phoneColumns = ['phone number', 'phone', 'mobile', 'contact', 'phonenumber'];
    for (const key of Object.keys(firstExtractedRow)) {
      if (phoneColumns.includes(key.toLowerCase())) {
        phoneKey = key;
        break;
      }
    }
  }

  let deduplicated = extractedRows;
  let duplicatesRemoved = 0;
  if (phoneKey && extractedRows.length > 0) {
    const seen = new Set();
    const unique = [];
    for (const row of extractedRows) {
      try {
        const phone = String(row[phoneKey] || '').replace(/\D/g, '');
        if (phone && !seen.has(phone)) {
          seen.add(phone);
          unique.push(row);
        } else if (phone) {
          duplicatesRemoved++;
        } else {
          unique.push(row);
        }
      } catch (err) {
        // If error processing phone, still include the row
        unique.push(row);
      }
    }
    deduplicated = unique;
  }

  // Filter out accepted/delivered orders
  let filteredStatusCount = 0;
  const statusPattern = /(?:accepted|delivered|order\s+(?:accepted|delivered)|has\s+been\s+(?:delivered|accepted))/i;
  const finalRows = deduplicated.filter((row) => {
    const text = String(row[textKey] || '');
    if (statusPattern.test(text)) {
      filteredStatusCount++;
      return false;
    }
    return true;
  });

  return {
    rows: finalRows,
    extractedCount: extractedRows.length,
    total: rows.length,
    duplicatesRemoved,
    filteredStatusCount,
    finalCount: finalRows.length
  };
}

module.exports = { parseCSVBuffer, parseExcelBuffer, extractProductFromText, extractProductsFromRows };

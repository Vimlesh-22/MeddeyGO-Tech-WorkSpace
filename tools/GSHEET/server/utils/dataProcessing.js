const { uniqBy } = require('lodash');
const { parse, format, addDays, isValid } = require('date-fns');

// Filter by Template Name column (column D) - filter out cancelled, delivered, shipped
function filterByTemplateName(rows) {
  if (!Array.isArray(rows)) return [];
  
  // Find Template Name column (case-insensitive, also check column D)
  let templateNameKey = null;
  const firstRow = rows[0] || {};
  
  // Check for Template Name column variations
  const templateNameVariations = ['template name', 'templatename', 'template', 'automation name', 'automationname'];
  for (const key of Object.keys(firstRow)) {
    const normalized = key.toLowerCase().replace(/\s+/g, '');
    if (templateNameVariations.some(variation => normalized.includes(variation))) {
      templateNameKey = key;
      break;
    }
  }
  
  // If no Template Name column found, check if we can use column D (4th column, index 3)
  if (!templateNameKey && rows.length > 0) {
    const keys = Object.keys(firstRow);
    // Column D would be the 4th column (index 3)
    if (keys.length > 3) {
      templateNameKey = keys[3]; // Column D (0-indexed: A=0, B=1, C=2, D=3)
    }
  }
  
  // If still no Template Name column found, return all rows (no filtering)
  if (!templateNameKey) {
    return rows;
  }
  
  // Filter out rows where Template Name contains: cancelled, delivered, shipped
  // Case-insensitive, partial match (can contain many text)
  const filteredValues = ['cancelled', 'delivered', 'shipped'];
  
  return rows.filter((row) => {
    const templateValue = String(row[templateNameKey] || '').toLowerCase().trim();
    
    // Check if template value contains any of the filtered values
    for (const filteredValue of filteredValues) {
      if (templateValue.includes(filteredValue)) {
        return false; // Remove this row
      }
    }
    
    return true; // Keep this row
  });
}

const COLUMN_MAPPINGS = {
  Date: ['date', 'sent time', 'sent date', 'senttime', 'sent_time'],
  'Phone Number': ['phone number', 'phone', 'mobile', 'contact', 'phonenumber'],
  'Product Name': ['product name', 'product', 'productname', 'item']
};

function extractRequiredColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  
  // First, find which columns match our required columns
  const foundColumns = {};
  const firstRow = rows[0] || {};
  
  for (const [target, options] of Object.entries(COLUMN_MAPPINGS)) {
    const match = Object.keys(firstRow).find((key) => {
      const normalized = key.toLowerCase().replace(/\s+/g, '');
      return options.some((option) => {
        const normalizedOption = option.toLowerCase().replace(/\s+/g, '');
        return normalized === normalizedOption || normalized.includes(normalizedOption) || normalizedOption.includes(normalized);
      });
    });
    if (match) {
      foundColumns[match] = target;
    }
  }
  
  // Check if we have all required columns (matching Python behavior)
  if (Object.keys(foundColumns).length < 3) {
    const foundValues = new Set(Object.values(foundColumns));
    const missing = Object.keys(COLUMN_MAPPINGS).filter(key => !foundValues.has(key));
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }
  
  // Process rows with column mapping - preserve all rows
  const processed = rows.map((row) => {
    const output = {};
    for (const [sourceCol, targetCol] of Object.entries(foundColumns)) {
      // Get value from source column, use empty string if missing
      const value = row[sourceCol];
      output[targetCol] = (value != null && value !== '') ? value : '';
    }
    return output;
  });

  // Process Date column - preserve original format but extract date part
  // Process ALL rows first, then filter more leniently (matching Python behavior)
  // Be very lenient - preserve rows even if date format is unusual
  const processedWithDates = processed.map((row) => {
    const output = { ...row };
    
    // Process Date column - be lenient, preserve original if conversion fails
    if (output.Date) {
      try {
        const dateStr = String(output.Date).trim();
        
        // Skip processing if date is clearly invalid
        if (dateStr === 'nan' || dateStr === 'NaT' || dateStr === 'null' || dateStr === 'undefined' || dateStr === '') {
          // Keep original value - don't filter yet
          output.Date = dateStr;
        } else {
          // If it's a datetime string (contains time), extract date part
          if (dateStr.includes(' ')) {
            const datePart = dateStr.split(' ')[0];
            // Convert YYYY-MM-DD to DD-MM-YYYY if needed
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
              const parts = datePart.split('-');
              output.Date = `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
            } else {
              // Keep original date part if format doesn't match - preserve data
              output.Date = datePart;
            }
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            // Convert YYYY-MM-DD to DD-MM-YYYY
            const parts = dateStr.split('-');
            output.Date = `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
          }
          // Otherwise keep as-is (preserve original format) - this preserves more data
        }
      } catch (e) {
        // If date processing fails, keep original value - preserve the row
        // This is critical to preserve maximum data
        console.warn(`Date processing warning for row: ${e.message}`);
        // Keep original date value - don't lose the row
      }
    }
    
    // Ensure Phone Number and Product Name are strings (even if empty)
    // This preserves rows even if these fields are missing
    if (!output['Phone Number'] || 
        output['Phone Number'] === 'null' || 
        output['Phone Number'] === 'undefined' || 
        output['Phone Number'] === 'nan' ||
        output['Phone Number'] === 'NaT') {
      output['Phone Number'] = '';
    }
    
    if (!output['Product Name'] || 
        output['Product Name'] === 'null' || 
        output['Product Name'] === 'undefined' || 
        output['Product Name'] === 'nan' ||
        output['Product Name'] === 'NaT') {
      output['Product Name'] = '';
    }
    
    return output;
  });

  // Very lenient filtering - preserve maximum data
  // Only remove rows with completely missing/invalid dates
  // Phone Number and Product Name can be empty - we preserve those rows
  const filtered = processedWithDates.filter((row) => {
    // Date is required - but be very lenient about what counts as a valid date
    const dateValue = row.Date;
    
    // Remove only if date is completely missing or clearly invalid
    if (!dateValue || 
        dateValue === 'nan' || 
        dateValue === 'NaT' || 
        dateValue === '' || 
        dateValue === 'null' || 
        dateValue === 'undefined' ||
        String(dateValue).trim() === '') {
      return false;
    }
    
    // If date exists (even if format is unusual), preserve the row
    // This matches Python behavior - preserve data even if date format is not perfect
    // Phone Number and Product Name are optional - keep row even if empty
    return true;
  });

  return filtered;
}

function normalizePhoneNumber(rows) {
  return rows.map((row) => {
    const phoneValue = row['Phone Number'];
    
    // If phone number exists and is not empty, normalize it
    if (phoneValue && String(phoneValue).trim() !== '' && 
        String(phoneValue).trim() !== 'null' && 
        String(phoneValue).trim() !== 'undefined' &&
        String(phoneValue).trim() !== 'nan' &&
        String(phoneValue).trim() !== 'NaT') {
      const cleaned = String(phoneValue).replace(/\D/g, '');
      const normalized = cleaned ? Number(cleaned) : null;
      return {
        ...row,
        'Phone Number': normalized
      };
    }
    
    // If phone number is empty, keep it as empty string (preserve row)
    // This matches Python behavior - phone number can be empty
    return {
      ...row,
      'Phone Number': ''
    };
  });
}

function dedupeByPhone(rows) {
  // More lenient deduplication - only dedupe rows with same phone number
  // If phone number is empty, preserve all rows (don't dedupe)
  // This preserves maximum data
  const seen = new Map();
  const result = [];
  
  for (const row of rows) {
    const phone = String(row['Phone Number'] || '').replace(/\D/g, '');
    
    if (phone && phone !== '') {
      // If phone exists, dedupe by phone (keep first occurrence)
      if (!seen.has(phone)) {
        seen.set(phone, true);
        result.push(row);
      }
      // Skip duplicate phone numbers
    } else {
      // If phone is empty, preserve ALL rows (don't dedupe)
      // This preserves maximum data - matching Python behavior
      result.push(row);
    }
  }
  
  return result;
}

// Extract dates from CSV data rows
function extractDatesFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  
  const dateKey = Object.keys(rows[0] || {}).find((key) => 
    COLUMN_MAPPINGS.Date.some((option) => key.toLowerCase().replace(/\s+/g, '').includes(option.replace(/\s+/g, '')))
  );
  
  if (!dateKey) return [];
  
  const uniqueDates = new Set();
  const parseErrors = [];
  
  for (const row of rows) {
    const dateStr = String(row[dateKey] || '').trim();
    if (!dateStr || dateStr === 'nan' || dateStr === 'NaT' || dateStr === '') continue;
    
    let parsedDate = null;
    
    // Try DD-MM-YYYY format first (user requirement)
    try {
      const parts = dateStr.split(/[-/.]/);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        // Validate: day must be 1-31, month must be 1-12
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          const date = new Date(year, month - 1, day);
          if (isValid(date) && date.getDate() === day && date.getMonth() === month - 1) {
            parsedDate = date;
          }
        } else if (day > 12 && month >= 1 && month <= 12) {
          // If day > 12, it MUST be DD-MM format
          const date = new Date(year, month - 1, day);
          if (isValid(date)) {
            parsedDate = date;
          }
        }
      }
    } catch (e) {
      // Continue to next format
    }
    
    // Try YYYY-MM-DD format
    if (!parsedDate) {
      try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const parts = dateStr.split('-');
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          const date = new Date(year, month - 1, day);
          if (isValid(date)) {
            parsedDate = date;
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Try flexible parsing
    if (!parsedDate) {
      try {
        const parsed = parse(dateStr, 'dd-MM-yyyy', new Date());
        if (isValid(parsed)) {
          parsedDate = parsed;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (parsedDate && isValid(parsedDate)) {
      uniqueDates.add(parsedDate.toISOString());
    } else {
      parseErrors.push(dateStr);
    }
  }
  
  return Array.from(uniqueDates).map((iso) => new Date(iso));
}

module.exports = {
  filterByTemplateName,
  extractRequiredColumns,
  normalizePhoneNumber,
  dedupeByPhone,
  extractDatesFromRows
};

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { isValid } = require('date-fns');
const { DEFAULT_GOOGLE_SHEET_ID, CREDENTIALS_FILE, GOOGLE_CREDENTIALS } = require('../config');

class SheetsManager {
  constructor(sheetId = DEFAULT_GOOGLE_SHEET_ID, credsPath = CREDENTIALS_FILE, credentials = GOOGLE_CREDENTIALS) {
    this.sheetId = sheetId;
    this.credsPath = credsPath;
    this.credentials = credentials; // Accept credentials object directly
    this.jwtClient = null;
    this.sheetsApi = null;
  }

  async authorize() {
    if (this.jwtClient) return this.jwtClient;
    
    let credentials;
    
    // Priority 1: Use credentials object if provided (from env vars)
    if (this.credentials && this.credentials.client_email && this.credentials.private_key) {
      console.log('[SheetsManager] Using credentials from environment variables');
      credentials = this.credentials;
    } 
    // Priority 2: Use credentials file path
    else {
      const credsFile = this.credsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!credsFile) {
        throw new Error('Google credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_* env vars or GOOGLE_APPLICATION_CREDENTIALS.');
      }
      const resolved = path.resolve(credsFile);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Google credentials file not found at ${resolved}`);
      }
      console.log('[SheetsManager] Using credentials from file:', resolved);
      credentials = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    }
    
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    this.jwtClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      scopes
    );
    await this.jwtClient.authorize();
    this.sheetsApi = google.sheets({ version: 'v4', auth: this.jwtClient });
    return this.jwtClient;
  }

  async getSheetsApi() {
    if (!this.sheetsApi) {
      await this.authorize();
    }
    return this.sheetsApi;
  }

  async getSpreadsheet() {
    const sheets = await this.getSheetsApi();
    const { data } = await sheets.spreadsheets.get({ spreadsheetId: this.sheetId });
    return data;
  }

  async findWorksheetByTitle(title) {
    const spreadsheet = await this.getSpreadsheet();
    const sheet = spreadsheet.sheets.find((s) => s.properties && s.properties.title === title);
    return sheet ? sheet.properties : null;
  }

  async renameWorksheet(oldTitle, newTitle) {
    const sheets = await this.getSheetsApi();
    const spreadsheet = await this.getSpreadsheet();
    const sheet = spreadsheet.sheets.find((s) => s.properties.title === oldTitle);
    if (!sheet) return false;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheet.properties.sheetId,
                title: newTitle
              },
              fields: 'title'
            }
          }
        ]
      }
    });
    return true;
  }

  async ensureWorksheet(title, headers) {
    const sheets = await this.getSheetsApi();
    const spreadsheet = await this.getSpreadsheet();
    const existing = spreadsheet.sheets.find((s) => s.properties.title === title);
    if (existing) {
      return existing.properties.sheetId;
    }
    const { data } = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
                gridProperties: {
                  rowCount: Math.max(200, headers ? headers.length + 50 : 200),
                  columnCount: headers ? headers.length : 20
                }
              }
            }
          }
        ]
      }
    });
    const replies = data.replies || [];
    const addSheetReply = replies.find((r) => r.addSheet);
    return addSheetReply?.addSheet?.properties?.sheetId || null;
  }

  async clearWorksheet(title) {
    const sheets = await this.getSheetsApi();
    await sheets.spreadsheets.values.clear({
      spreadsheetId: this.sheetId,
      range: `'${title}'`
    });
  }

  async writeRows(title, headers, rows) {
    const sheets = await this.getSheetsApi();
    const values = [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ''))];
    await sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  }

  async appendRows(title, headers, rows) {
    const sheets = await this.getSheetsApi();
    const values = rows.map((row) => headers.map((key) => row[key] ?? ''));
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });
  }

  async getWorksheetNames() {
    const spreadsheet = await this.getSpreadsheet();
    return spreadsheet.sheets.map((s) => s.properties.title);
  }

  async findMatchingTab(companyName, dateStr = null) {
    try {
      const allTabs = await this.getWorksheetNames();
      const companyLower = companyName.toLowerCase();
      
      // If we have a date, try to extract month and day
      const datePatterns = [];
      if (dateStr) {
        try {
          const date = new Date(dateStr);
          if (!isNaN(date)) {
            const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            const day = date.getDate();
            datePatterns.push(
              `${month} ${day}`,
              `${month} ${day}-`,
              `-${day} `,
              `${month.toLowerCase()} ${day}`
            );
          }
        } catch (e) {
          // Ignore
        }
      }
      
      // Priority 1: Tab with date AND company name
      if (datePatterns.length > 0) {
        for (const tab of allTabs) {
          const tabLower = tab.toLowerCase();
          if (tabLower.includes(companyLower)) {
            for (const pattern of datePatterns) {
              if (tabLower.includes(pattern.toLowerCase())) {
                return tab;
              }
            }
          }
        }
      }
      
      // Priority 2: Tab with just company name
      for (const tab of allTabs) {
        if (tab.toLowerCase().includes(companyLower)) {
          return tab;
        }
      }
      
      return null;
    } catch (e) {
      console.warn(`Error finding matching tab: ${e.message}`);
      return null;
    }
  }

  async clearFilters(worksheetName) {
    try {
      const sheets = await this.getSheetsApi();
      const spreadsheet = await this.getSpreadsheet();
      const sheet = spreadsheet.sheets.find((s) => s.properties.title === worksheetName);
      if (!sheet) {
        throw new Error(`Worksheet '${worksheetName}' not found`);
      }
      
      // Clear basic filter using Sheets API (matching Python behavior)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: {
          requests: [
            {
              clearBasicFilter: {
                sheetId: sheet.properties.sheetId
              }
            }
          ]
        }
      });
      
      return true;
    } catch (e) {
      // Filter might not exist, which is fine (matching Python behavior)
      if (e.message && (e.message.includes('No filter exists') || e.message.includes('INVALID_VALUE'))) {
        return true;
      }
      throw new Error(`Error clearing filters: ${e.message}`);
    }
  }

  async clearDataExceptHeader(worksheetName) {
    try {
      const sheets = await this.getSheetsApi();
      
      // Get all values to determine the range (matching Python behavior)
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: `'${worksheetName}'!A:Z`
      });
      
      const allValues = existing.data.values || [];
      if (allValues.length <= 1) {
        // Only header exists or sheet is empty
        return true;
      }
      
      // Calculate last row and column
      const lastRow = allValues.length;
      const lastCol = allValues[0] ? allValues[0].length : 26; // Default to column Z
      
      // Convert column number to letter (matching Python's col_num_to_letter)
      const colNumToLetter = (n) => {
        let result = '';
        while (n > 0) {
          const remainder = (n - 1) % 26;
          result = String.fromCharCode(65 + remainder) + result;
          n = Math.floor((n - 1) / 26);
        }
        return result;
      };
      
      const lastColLetter = colNumToLetter(lastCol);
      const clearRange = `A2:${lastColLetter}${lastRow}`;
      
      // Use batchClear (matching Python's batch_clear)
      await sheets.spreadsheets.values.batchClear({
        spreadsheetId: this.sheetId,
        requestBody: {
          ranges: [`'${worksheetName}'!${clearRange}`]
        }
      });
      
      return true;
    } catch (e) {
      throw new Error(`Error clearing data: ${e.message}`);
    }
  }

  formatDataframeForUpload(df) {
    // Format DataFrame before uploading to Google Sheets
    // - Replace NaN/null/undefined with empty strings
    // - Format phone numbers as numbers (handled separately in formatColumnsAsNumber)
    // - Dates are already formatted as strings
    
    return df.map((row) => {
      const formatted = { ...row };
      // Replace null/undefined/NaN with empty strings (matching Python's fillna(''))
      for (const key in formatted) {
        if (formatted[key] === null || formatted[key] === undefined || 
            (typeof formatted[key] === 'number' && isNaN(formatted[key]))) {
          formatted[key] = '';
        }
      }
      return formatted;
    });
  }

  async formatColumnsAsNumber(worksheetName, columnLetters) {
    try {
      const sheets = await this.getSheetsApi();
      const spreadsheet = await this.getSpreadsheet();
      const sheet = spreadsheet.sheets.find((s) => s.properties.title === worksheetName);
      if (!sheet) return;
      
      const requests = columnLetters.map((col) => {
        // Convert column letter to index (A=0, B=1, etc.)
        const colIndex = col.charCodeAt(0) - 65;
        return {
          repeatCell: {
            range: {
              sheetId: sheet.properties.sheetId,
              startRowIndex: 1, // Start from row 2 (0-indexed)
              endRowIndex: 1000,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'NUMBER',
                  pattern: '0'
                }
              }
            },
            fields: 'userEnteredFormat.numberFormat'
          }
        };
      });
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: { requests }
      });
    } catch (e) {
      console.warn(`Error formatting columns: ${e.message}`);
    }
  }

  async processUpload(df, worksheetName, companyName = null) {
    try {
      await this.authorize();
      
      // Check if worksheet exists
      const exists = await this.findWorksheetByTitle(worksheetName);
      if (!exists) {
        throw new Error(`Tab '${worksheetName}' does not exist. Please create it manually in Google Sheets.`);
      }
      
      // Clear filters (matching Python behavior)
      await this.clearFilters(worksheetName);
      
      // Clear existing data (except header)
      await this.clearDataExceptHeader(worksheetName);
      
      const sheets = await this.getSheetsApi();
      
      // Get headers from first row or use default
      const headers = Object.keys(df[0] || {});
      if (headers.length === 0) {
        throw new Error('No data to upload');
      }
      
      // Format DataFrame (handle NaN and phone numbers)
      const dfClean = this.formatDataframeForUpload(df);
      const values = dfClean.map((row) => headers.map((key) => {
        const val = row[key];
        if (val === null || val === undefined) return '';
        return String(val);
      }));
      
      // Insert data starting from row 2
      if (values.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: `'${worksheetName}'!A2`,
          valueInputOption: 'USER_ENTERED', // Match Python's value_input_option
          requestBody: { values }
        });
      }
      
      // Format Phone Number column (column B) as NUMBER
      await this.formatColumnsAsNumber(worksheetName, ['B']);
      
      return true;
    } catch (e) {
      throw new Error(`Error processing upload: ${e.message}`);
    }
  }

  async appendData(worksheetName, df) {
    try {
      await this.authorize();
      
      // Check if worksheet exists - DO NOT create new ones! (matching Python behavior)
      const exists = await this.findWorksheetByTitle(worksheetName);
      if (!exists) {
        throw new Error(`Tab '${worksheetName}' does not exist. Please create it manually in Google Sheets.`);
      }
      
      const sheets = await this.getSheetsApi();
      
      // Get existing data to find where to append (matching Python behavior)
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: `'${worksheetName}'!A:Z`
      });
      
      const existingValues = existing.data.values || [];
      const nextRow = existingValues.length + 1;
      
      // Get headers from first row
      const headers = Object.keys(df[0] || {});
      if (headers.length === 0) {
        return 0;
      }
      
      // Format DataFrame (handle NaN and phone numbers) - matching Python
      const dfClean = this.formatDataframeForUpload(df);
      const values = dfClean.map((row) => headers.map((key) => {
        const val = row[key];
        if (val === null || val === undefined) return '';
        return String(val);
      }));
      
      // Append data (matching Python's value_input_option='USER_ENTERED')
      if (values.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetId,
          range: `'${worksheetName}'!A${nextRow}`,
          valueInputOption: 'USER_ENTERED', // Match Python's value_input_option
          requestBody: { values }
        });
      }
      
      return values.length;
    } catch (e) {
      throw new Error(`Error appending data: ${e.message}`);
    }
  }
}

module.exports = SheetsManager;

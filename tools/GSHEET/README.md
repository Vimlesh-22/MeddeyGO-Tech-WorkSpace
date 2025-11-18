# GSHEET Wizard — Node.js + React Version

Complete Node.js + React implementation of the Google Sheets Wizard, fully ported from the Python Streamlit version.

## ✅ Complete Implementation

All features from the Python version are now implemented:

- ✅ **All 6 wizard steps** (Upload, Extract, Detect, Process, Configure, Sync)
- ✅ **CSV and Excel file support** (.csv, .xlsx, .xls)
- ✅ **Advanced product extraction** with comprehensive pattern matching
- ✅ **Company detection** from filenames and data
- ✅ **Date extraction** from CSV data, filenames, and existing sheet tabs
- ✅ **Tab name calculation** with priority logic (CSV dates → Filename dates → Sheet dates)
- ✅ **Message status filtering** (Accepted/Delivered)
- ✅ **Data processing** with column extraction and normalization
- ✅ **Google Sheets integration** (Replace & Append modes)
- ✅ **Tab renaming functionality**
- ✅ **Logging functionality**

## 🚀 Quick Setup

### Option 1: Automatic Setup (Recommended)

**Windows (PowerShell):**
```powershell
cd "e:\sheets auto\node_wizard"
.\setup.ps1
```

**Linux/Mac:**
```bash
cd "e:\sheets auto\node_wizard"
chmod +x setup.sh
./setup.sh
```

The setup script will:
- Install all dependencies
- Copy `.env` and `credentials.json` from root directory
- Verify configuration

### Option 2: Manual Setup

1. **Install Dependencies:**

```powershell
# Root (Server dependencies)
cd "e:\sheets auto\node_wizard"
npm install

# Client
cd "e:\sheets auto\node_wizard\client"
npm install
```

2. **Copy Configuration Files:**

The setup script automatically copies your existing `.env` and `credentials.json` from the root directory. If you need to copy manually:

```powershell
# From root directory
Copy-Item credentials.json "node_wizard\server\credentials.json"
Copy-Item .env "node_wizard\server\.env"
```

Or create them based on the examples:
- `server/.env.example` → `server/.env`
- `server/credentials.json.example` → `server/credentials.json`

3. **Configure Environment:**

Edit `server/.env`:
```
GOOGLE_SHEET_ID=your_google_sheet_id_here
GOOGLE_CREDENTIALS_JSON=credentials.json
COMPANY_NAMES=Meddeygo,Medansh,Meddey
UPDATE_LOG=gsheet_wizard_updates.log
PORT=7777
```

## 🏃 Running the Application

### Option 1: Run Everything with One Command (Recommended)

**From `node_wizard` directory:**
```powershell
cd "e:\sheets auto\node_wizard"
npm run dev
```

This will start both server and client automatically!

**Or use the batch/shell script:**
```powershell
# Windows
.\START.bat

# Linux/Mac
chmod +x START.sh
./START.sh
```

### Option 2: Run Server and Client Separately

**Start Server (Terminal 1):**
```powershell
cd "e:\sheets auto\node_wizard\server"
npm start
```

Server runs on `http://localhost:7777`

**Start Client (Terminal 2):**
```powershell
cd "e:\sheets auto\node_wizard\client"
npm run dev
```

Client runs on `http://localhost:5173` (or another port if 5173 is busy)

### First Time Setup

**Important:** Before running `npm run dev`, you must install all dependencies:

```powershell
cd "e:\sheets auto\node_wizard"

# Install all dependencies (root, server, and client)
npm run install:all

# Copy configuration files from root directory
Copy-Item ..\..env "server\.env" -Force
Copy-Item ..\credentials.json "server\credentials.json" -Force

# Now you can run
npm run dev
```

**Or use the setup script:**
```powershell
cd "e:\sheets auto\node_wizard"
.\setup.ps1
```

This will:
- Install all dependencies
- Copy `.env` and `credentials.json` from root directory
- Verify configuration

See `QUICK_START.md` for detailed setup instructions.

## 📋 API Endpoints

- `POST /api/upload` - Step 1: Upload CSV/Excel files
- `POST /api/extract` - Step 2: Extract product names
- `POST /api/detect` - Step 3: Detect companies
- `POST /api/process` - Step 4: Process data & calculate tab names
- `POST /api/configure` - Step 5: Configure update mode
- `POST /api/sync` - Step 6: Sync to Google Sheets

## 🔧 Configuration

The Node.js version uses the **same configuration files** as the Python version:

- **`.env`** - Environment variables (same format as Python version)
- **`credentials.json`** - Google Sheets API credentials (same file as Python version)
- **`config/index.js`** - Node.js specific configuration

## 📁 Project Structure

```
node_wizard/
├── server/              # Express backend
│   ├── config/         # Configuration
│   ├── services/       # Google Sheets manager
│   ├── utils/          # Utilities (extractors, data processing, etc.)
│   ├── index.js        # Main server file
│   ├── .env            # Environment variables (copied from root)
│   └── credentials.json # Google credentials (copied from root)
├── client/             # React frontend
│   └── src/
│       ├── components/ # Wizard step components
│       └── App.jsx     # Main app
├── setup.ps1           # Windows setup script
├── setup.sh             # Linux/Mac setup script
└── SETUP.md            # Detailed setup guide
```

## ✨ Features

### Product Extraction
- Advanced pattern matching with confidence scoring
- Handles cart items, product names, prices, etc.
- Filters out order status messages
- Removes duplicates by phone number

### Company Detection
- Auto-detects company from filename
- Scans data content for company mentions
- Provides confidence scores

### Date Handling
- Extracts dates from CSV data (DD-MM-YYYY format preserved)
- Detects dates from filenames (29_jan_2025, DD_MM_YYYY, etc.)
- Extracts dates from existing sheet tab names (OCT 7 Meddeygo)
- Priority: CSV dates → Filename dates → Sheet dates

### Tab Naming
- Calculates tab names based on dates + 1 day
- Handles date ranges (OCT 5-6)
- Automatically renames existing tabs

### Google Sheets Integration
- Replace mode: Clears and replaces data
- Append mode: Adds data below existing rows
- Tab renaming support
- Error handling and logging

## 🔍 Troubleshooting

See `SETUP.md` for detailed troubleshooting guide.

## 📝 Notes

- The Node.js version uses the **same credentials and configuration** as the Python version
- Both versions can run simultaneously (on different ports)
- Logs are saved to `server/logs/` directory
- All functionality matches the Python version exactly

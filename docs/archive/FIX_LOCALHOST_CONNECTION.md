# Fix "localhost refused to connect" Issue

## ✅ Good News: Server IS Running!

The server is responding correctly on port **4090**. The issue is likely with the URL you're using.

## 🔧 Solution

### Use the Correct URL

**✅ CORRECT:**
```
http://localhost:4090
```

**❌ WRONG (these won't work):**
- `http://localhost` (missing port)
- `http://localhost:3000` (old port)
- `http://127.0.0.1` (missing port)
- `http://127.0.0.1:3000` (old port)

### Quick Fix Steps

1. **Open your browser**
2. **Type exactly:** `http://localhost:4090`
3. **Press Enter**

## 🔍 Why This Happens

After environment centralization, the server now runs on port **4090** (not 3000). If you:
- Bookmarked the old URL (`localhost:3000`)
- Have browser cache pointing to old port
- Type `localhost` without the port

You'll get "connection refused" because nothing is listening on those addresses.

## 🧪 Verify Server is Running

Run this diagnostic script:
```powershell
cd "E:\V2 'Meddey Tech Space'\project-hub"
powershell -ExecutionPolicy Bypass -File check-server.ps1
```

Or manually check:
```powershell
# Check if port 4090 is listening
netstat -ano | findstr ":4090" | findstr "LISTENING"

# Test HTTP connection
Invoke-WebRequest -Uri "http://localhost:4090" -UseBasicParsing
```

## 🚀 Start the Server (if not running)

If the server isn't running, start it with:

```powershell
cd "E:\V2 'Meddey Tech Space'\project-hub"
npm run dev
```

Wait for this message:
```
✓ Ready in X seconds
○ Local:        http://localhost:4090
```

Then open `http://localhost:4090` in your browser.

## 📝 Update Bookmarks

Update any bookmarks from:
- ❌ `http://localhost:3000` 
- ✅ `http://localhost:4090`

## 🔄 If Still Not Working

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. **Try incognito/private mode**
3. **Check firewall** isn't blocking port 4090
4. **Restart the server:**
   ```powershell
   # Stop current server (Ctrl+C in terminal)
   # Then restart:
   npm run dev
   ```

## 📋 Port Reference

| Service | Port | URL |
|---------|------|-----|
| **Meddey Tech Workspace** | **4090** | `http://localhost:4090` |
| Quote Generator API | 4094 | `http://localhost:4094` |
| Quote Generator UI | 4095 | `http://localhost:4095` |
| Inventory Management | 4096 | `http://localhost:4096` |
| Order Extractor | 4097 | `http://localhost:4097` |
| GSHEET Integration | 4091 | `http://localhost:4091` |
| Data Extractor | 4092 | `http://localhost:4092` |
| File Merger | 4093 | `http://localhost:4093` |

## ✅ Success Indicators

When it's working, you should see:
- ✅ Login page loads
- ✅ No "connection refused" error
- ✅ URL shows `http://localhost:4090` in address bar


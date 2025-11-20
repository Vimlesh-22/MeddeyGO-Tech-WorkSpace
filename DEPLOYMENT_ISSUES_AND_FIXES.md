# Vercel Deployment Issues & Fixes

This document tracks all issues encountered during Vercel deployment and their solutions.

---

## Issue 1: MODULE_NOT_FOUND - Google Credentials

**Error:**
```
Error: Cannot find module '../../../_shared/utils/googleCredentials'
```

**Root Cause:**
Incorrect relative import paths in GSHEET and inventory-management tools. Import paths were using `../../_shared` instead of `../../../_shared`.

**Files Affected:**
- `tools/GSHEET/server/config/index.js`
- `tools/inventory-management/backend/services/googleSheets.js`

**Fix:**
Updated import paths from `../../_shared` to `../../../_shared`:
```javascript
const { getGoogleCredentials } = require('../../../_shared/utils/googleCredentials');
```

**Commit:** `43963f3`

---

## Issue 2: Non-Existent Tool Cards Displayed

**Error:**
Dashboard displayed 4 tools that don't exist in the tools folder.

**Tools Removed:**
- ai-seo-strategist
- order-extractor
- file-merger
- data-extractor-pro

**Files Modified:**
- `src/data/projects.ts` - Removed 4 non-existent tool definitions
- `src/data/toolContent.ts` - Cleaned up schedules, messages, and tutorials

**Fix:**
Kept only 3 existing tools:
- quote-generator
- inventory-management
- gsheet-integration

**Commit:** `d38be97`

---

## Issue 3: Vercel Can't Detect Next.js Version

**Error:**
```
No Next.js version detected in package.json
```

**Root Cause:**
Missing `version` property in `vercel.json`.

**Fix:**
Added `"version": 2` to `vercel.json`:
```json
{
  "version": 2,
  "framework": "nextjs"
}
```

**Commit:** `d91e95e`

---

## Issue 4: Python Installation During Build

**Error:**
Vercel spent 30+ seconds installing Python packages (streamlit, flask, pandas) during build.

**Root Cause:**
- `requirements.txt` existed in root
- Postinstall script in `package.json` ran Python setup
- Python utility files in `tools/_shared/utils/`

**Fix:**
1. Deleted `requirements.txt` (654 lines)
2. Removed postinstall script from `package.json`
3. Deleted Python files:
   - `tools/_shared/utils/logger.py`
   - `tools/_shared/utils/port_utils.py`
   - `tools/_shared/utils/sanitize.py`

**Commit:** `f750019`

---

## Issue 5: Multiple Conflicting package.json Files

**Error:**
Vercel confused by workspace/monorepo structure with multiple package.json files.

**Root Cause:**
- `tools/GSHEET/package.json`
- `tools/inventory-management/package.json`
- `workspaces` array in root `package.json`

**Fix:**
1. Deleted tool-specific package.json files
2. Removed `workspaces` array from root package.json
3. Made Next.js app the single source of truth

**Files Deleted:**
- `tools/GSHEET/package.json`
- `tools/inventory-management/package.json`

**Commit:** `fb16f15`

---

## Issue 6: Vercel Looking for .next in Wrong Directory

**Error:**
```
The file '/vercel/path0/projecthub/.next/routes-manifest.json' couldn't be found
```

**Root Cause:**
Leftover `projecthub/` directory from previous workspace configuration caused Vercel to look for build artifacts in wrong location.

**Fix:**
1. Deleted entire `projecthub/` directory
2. Removed projecthub scripts from package.json:
   - `"start:projecthub"`
   - `"dev:projecthub"`

**Files Deleted:**
- `projecthub/index.js`
- `projecthub/package.json`

**Commit:** `ce09f03`

---

## Issue 7: Root Directory Configuration Error

**Error:**
```
The specified Root Directory "projecthub" does not exist. Please update your Project Settings.
```

**Root Cause:**
Vercel project settings still pointed to deleted `projecthub` directory.

**Fix:**
Added explicit root directory setting to `vercel.json`:
```json
{
  "rootDirectory": "."
}
```

**Commit:** `cb8923e`

---

## Issue 8: Invalid rootDirectory Property

**Error:**
```
Invalid request: should NOT have additional property `rootDirectory`.
Please remove it.
```

**Root Cause:**
Vercel API rejected the `rootDirectory` property (only valid in dashboard, not vercel.json).

**Fix:**
Removed `"rootDirectory": "."` from `vercel.json` and cleared Root Directory field in Vercel dashboard settings (Settings → General → Root Directory → empty).

**Commit:** `7b54cf4`

---

## Issue 9: Wrong Repository Connected to Vercel

**Error:**
```
To deploy to production, push to the Repository Default branch.
```

**Root Cause:**
Vercel was connected to `pawanarora10/MeddeyGO-Tech-WorkSpaces` but code was being pushed to `Vimlesh-22/MeddeyGO-Tech-WorkSpace`.

**Fix:**
Pushed code to both repositories:
```bash
# Primary repo (Vimlesh-22)
git push origin main

# Vercel-connected repo (pawanarora10)
git push https://pawanarora10@github.com/pawanarora10/MeddeyGO-Tech-WorkSpaces.git main
```

**Final Status:** ✅ Successfully deployed

---

## Issue 10: OTP Emails Failing in Production

**Error:**
```
Unable to send OTP
```

**Root Cause:**
`getBaseUrl()` threw in production when `DOMAIN`/`NEXT_PUBLIC_BASE_URL` were not set, so OTP requests crashed before emails could be sent on Vercel.

**Fix:**
- Added `VERCEL_URL` fallback in domain resolution for production
- Updated validation to allow the fallback while still blocking localhost/IP usage

**Files Modified:**
- `src/lib/domain-config.ts`

**Commit:** _pending_

---

## Issue 11: Missing Tailwind PostCSS Plugin During Build

**Error:**
```
Error: Cannot find module '@tailwindcss/postcss'
Require stack:
- /vercel/path0/node_modules/next/dist/build/webpack/config/blocks/css/plugins.js
...
```

**Root Cause:**
`@tailwindcss/postcss` was listed in `devDependencies`, so Vercel (with production installs) skipped it and the Next.js build failed while loading PostCSS plugins.

**Fix:**
- Moved `@tailwindcss/postcss` to `dependencies` so it is installed in production
- Regenerated `package-lock.json` to capture the dependency change

**Files Modified:**
- `package.json`
- `package-lock.json`

**Commit:** _pending_

---

## Issue 12: Media Library Uploads Failing on Vercel

**Error:**
```
ENOENT: no such file or directory, mkdir '/var/task/public'
```

**Root Cause:**
Vercel serverless functions run on read-only filesystems, so attempts to create `/public/uploads` for Media Library assets crashed when the upload route called `mkdir`.

**Fix:**
- Added Vercel Blob storage support in `saveUploadedFile` with automatic blob fallback on Vercel
- Introduced `FILE_STORAGE_STRATEGY` env to choose between `local` (dev) and `blob` (production)
- Documented `BLOB_READ_WRITE_TOKEN` requirement in `.env.example`

**Files Modified:**
- `src/lib/storage/upload.ts`
- `.env.example`
- `package.json`
- `package-lock.json`

**Commit:** _pending_

---

## Key Lessons Learned

1. **Vercel Root Directory:** For single Next.js apps, leave Root Directory empty in dashboard settings
2. **Python Dependencies:** Remove all Python files for Node.js-only deployments
3. **Workspaces:** Avoid workspace configuration for single-app deployments
4. **Import Paths:** Verify relative paths match actual folder structure
5. **Clean Up:** Remove leftover directories/files from previous configurations
6. **Repository Sync:** Ensure Vercel is connected to the repository you're actually pushing to

---

## Final Vercel Configuration

**vercel.json:**
```json
{
  "version": 2,
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

**Dashboard Settings:**
- Root Directory: *(empty)*
- Framework Preset: Next.js
- Build Command: `npm run build`
- Install Command: `npm install`

---

## Issue 10: Tailwind CSS PostCSS Plugin Missing

**Error:**
```
Error: Cannot find module '@tailwindcss/postcss'
```

**Root Cause:**
The `@tailwindcss/postcss` package was not properly installed or recognized during the Vercel build process, despite being listed in dependencies.

**Fix:**
1. Ensured all dependencies were properly installed with `npm install`
2. Verified `@tailwindcss/postcss` package exists in `node_modules/@tailwindcss/postcss`
3. The package was correctly configured in `postcss.config.mjs`

**Files Modified:**
- `postcss.config.mjs` (already correct)
- `package.json` (already had the dependency)

**Commit:** `2b534ec`

---

## Issue 11: Duplicate Import in NotificationPopup Component

**Error:**
```
Module parse failed: Identifier 'useSession' has already been declared
```

**Root Cause:**
Duplicate import statements for `useSession` from the same module in `NotificationPopup.tsx`.

**Fix:**
Removed the duplicate import line:
```tsx
// Removed this duplicate line:
import { useSession } from "@/contexts/SessionContext";
```

**Files Modified:**
- `src/components/ui/NotificationPopup.tsx`

**Commit:** `2b534ec`

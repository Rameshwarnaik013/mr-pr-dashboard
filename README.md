# Procurement Fulfillment Dashboard

## Files
- `index.html` — The dashboard (deploy to Vercel)
- `vercel.json` — Vercel configuration
- `Code.gs`    — Google Apps Script (paste into your Google Sheet)

---

## Step 1 — Deploy to Vercel

### Option A: Vercel CLI (fastest)
```bash
npm i -g vercel
cd procurement-dashboard
vercel --prod
```

### Option B: Vercel Dashboard (no CLI)
1. Go to https://vercel.com → New Project
2. Import from GitHub **or** drag-and-drop the folder
3. Leave all settings default → Deploy
4. Your dashboard URL: `https://your-project.vercel.app`

---

## Step 2 — Connect Google Sheet (Apps Script)

1. Open your Google Sheet
2. Click **Extensions → Apps Script**
3. Delete any existing code in `Code.gs`
4. Paste the entire contents of `Code.gs` from this folder
5. Update `CONFIG` at the top if your column names differ:
   ```js
   const CONFIG = {
     SHEET_NAME: "Sheet1",      // ← Your actual tab name
     COL_MR_NO: "MR No.",       // ← Must match column header exactly
     // ... etc
   };
   ```
6. Click **Run → testScript** to verify it works (check Logs)
7. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy** → copy the **Web App URL**

---

## Step 3 — Link dashboard to sheet

1. Open your Vercel dashboard URL
2. Click **⚙ Setup** (top right)
3. Paste the Apps Script Web App URL
4. Click **Save & Connect**

Data loads automatically. Click **Refresh** anytime to pull latest.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Sheet not found" | Check `SHEET_NAME` in `Code.gs` matches your tab name |
| "Missing columns" | Check column header spelling in `CONFIG` |
| CORS error | Redeploy Apps Script with "Anyone" access |
| Empty data | Run `testScript` in Apps Script editor and check Logs |

---

## SLA Threshold
The on-time SLA is set to **2 days** (editable in `index.html`):
```js
const SLA = 2;
```

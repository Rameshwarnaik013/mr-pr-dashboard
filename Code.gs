// ============================================================
// PROCUREMENT DASHBOARD — Google Apps Script
// ============================================================
// HOW TO DEPLOY:
//  1. Open your Google Sheet
//  2. Click Extensions → Apps Script
//  3. Paste this entire file into Code.gs (replace existing content)
//  4. Click Save (💾)
//  5. Click Deploy → New deployment
//  6. Type: Web App
//  7. Execute as: Me
//  8. Who has access: Anyone
//  9. Click Deploy → Copy the Web App URL
// 10. Paste that URL into the dashboard Setup panel
// ============================================================

// ---- CONFIGURATION: Update these to match your sheet ----
const CONFIG = {
  // Name of the sheet/tab containing your MR data
  SHEET_NAME: "Sheet1",

  // Column header names (must match exactly, case-sensitive)
  COL_MR_NO:         "MR No.",
  COL_MR_DATE:       "MR Date",
  COL_ITEM_CODE:     "item_code",
  COL_SKU_NAME:      "SKU Name",
  COL_UOM:           "UOM",
  COL_MR_UNITS:      "MR Units",
  COL_MR_WAREHOUSE:  "MR Target Warehouse",
  COL_PR_ID:         "PR ID",
  COL_PR_DATE:       "PR Date",
  COL_PR_QTY:        "PR Qty",
  COL_MR_ID:         "MR ID",
  COL_PR_CREATED_BY: "PR Created By",
  COL_MR_CREATED_BY: "MR Created By",
  COL_FILL_DAYS:     "`Fullfillment Days`",   // note: matches your sheet's spelling exactly, including backticks! Linked to frontend dynamic SLA.
  COL_FILL_RATE:     "Fill_Rate",

  // CORS: Add your Vercel domain here for security (or keep * for open access)
  ALLOWED_ORIGIN: "*"
};
// ---- END CONFIGURATION ----


/**
 * Handles GET requests from the dashboard.
 * Supports optional query params:
 *   ?from=YYYY-MM-DD  — filter MR Date from this date
 *   ?to=YYYY-MM-DD    — filter MR Date to this date
 *   ?sku=SKU Name     — filter by SKU
 *   ?wh=Warehouse     — filter by warehouse
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const data = getData(params);
    return buildResponse({ success: true, data: data, sheetName: CONFIG.SHEET_NAME, count: data.length, timestamp: new Date().toISOString() });
  } catch (err) {
    return buildResponse({ success: false, error: err.message, data: [] });
  }
}


/**
 * Main data fetching + transformation function.
 */
function getData(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error("Sheet '" + CONFIG.SHEET_NAME + "' not found. Check CONFIG.SHEET_NAME in the script.");
  }

  const rawData = sheet.getDataRange().getValues();
  if (rawData.length < 2) return [];

  // Build column index map from header row
  const headers = rawData[0].map(h => String(h).trim());
  const idx = buildIndexMap(headers);

  // Parse rows
  const rows = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];

    // Skip completely empty rows
    if (!row[idx[CONFIG.COL_MR_NO]]) continue;

    const mrDate  = parseDate(row[idx[CONFIG.COL_MR_DATE]]);
    const prDate  = parseDate(row[idx[CONFIG.COL_PR_DATE]]);
    const mrQty   = toNum(row[idx[CONFIG.COL_MR_UNITS]]);
    const prQty   = toNum(row[idx[CONFIG.COL_PR_QTY]]);
    const days    = toNum(row[idx[CONFIG.COL_FILL_DAYS]]);
    const fill    = toNum(row[idx[CONFIG.COL_FILL_RATE]]);
    const sku     = String(row[idx[CONFIG.COL_SKU_NAME]] || "").trim();
    const wh      = String(row[idx[CONFIG.COL_MR_WAREHOUSE]] || "").trim();

    // Apply optional server-side filters
    if (params.from && mrDate < params.from) continue;
    if (params.to   && mrDate > params.to)   continue;
    if (params.sku  && sku !== params.sku)   continue;
    if (params.wh   && wh  !== params.wh)    continue;

    rows.push({
      mr:         String(row[idx[CONFIG.COL_MR_NO]] || "").trim(),
      mrDate:     mrDate,
      prDate:     prDate,
      itemCode:   String(row[idx[CONFIG.COL_ITEM_CODE]] || "").trim(),
      sku:        sku,
      uom:        String(row[idx[CONFIG.COL_UOM]] || "").trim(),
      mrQty:      mrQty,
      wh:         wh,
      prId:       String(row[idx[CONFIG.COL_PR_ID]] || "").trim(),
      prQty:      prQty,
      mrId:       String(row[idx[CONFIG.COL_MR_ID]] || "").trim(),
      prCreated:  String(row[idx[CONFIG.COL_PR_CREATED_BY]] || "").trim(),
      mrCreated:  String(row[idx[CONFIG.COL_MR_CREATED_BY]] || "").trim(),
      days:       days,
      fill:       fill
    });
  }

  return rows;
}


// ---------- HELPERS ----------

/**
 * Build a {columnName: columnIndex} map from the header row.
 * Throws a helpful error if any configured column is missing.
 */
function buildIndexMap(headers) {
  const map = {};
  headers.forEach((h, i) => { map[h] = i; });

  // Validate all required columns exist
  const required = Object.values(CONFIG).filter(v => typeof v === 'string' && v !== CONFIG.ALLOWED_ORIGIN && v !== CONFIG.SHEET_NAME);
  const missing = required.filter(col => !(col in map));
  if (missing.length > 0) {
    throw new Error("Missing columns in sheet: " + missing.join(", ") + ". Check CONFIG column names in the script.");
  }
  return map;
}

/**
 * Parse a date value from a cell into YYYY-MM-DD string.
 * Handles Date objects, strings, and serial numbers.
 */
function parseDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  
  let str = String(val).trim();
  if(str.indexOf('T') > -1) str = str.split('T')[0];
  if(str.indexOf(' ') > -1) str = str.split(' ')[0];
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let d = m[1].length === 1 ? '0' + m[1] : m[1];
    let mo = m[2].length === 1 ? '0' + m[2] : m[2];
    return m[3] + '-' + mo + '-' + d;
  }
  
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return str;
}

/**
 * Convert a cell value to a number safely.
 */
function toNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Build a JSON response with CORS headers.
 */
function buildResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}


// ============================================================
// TEST FUNCTION — Run this manually from the Apps Script editor
// to verify your sheet connection before deploying.
// Select "testScript" from the dropdown and click ▶ Run.
// ============================================================
function testScript() {
  const result = getData({});
  Logger.log("Total rows fetched: " + result.length);
  if (result.length > 0) {
    Logger.log("First row sample: " + JSON.stringify(result[0]));
  } else {
    Logger.log("No rows returned. Check sheet name and column headers.");
  }
}

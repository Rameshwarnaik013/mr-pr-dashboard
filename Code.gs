// ============================================================
// PROCUREMENT DASHBOARD — Google Apps Script (ROBUST VERSION)
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

// ---- CONFIGURATION ----
const CONFIG = {
  SHEET_NAME: "Sheet1",
  ALLOWED_ORIGIN: "*"
};

// Column header names — the script will try EXACT match first,
// then try matching after stripping backticks/spaces.
// This way it works whether your sheet says `Fullfillment Days` or Fullfillment Days.
const COLUMN_MAP = {
  mrNo:        "MR No.",
  mrDate:      "MR Date",
  itemCode:    "item_code",
  skuName:     "SKU Name",
  uom:         "UOM",
  mrUnits:     "MR Units",
  mrWarehouse: "MR Target Warehouse",
  prId:        "PR ID",
  prDate:      "PR Date",
  prQty:       "PR Qty",
  mrId:        "MR ID",
  prCreatedBy: "PR Created By",
  mrCreatedBy: "MR Created By",
  fillDays:    "Fullfillment Days",
  fillRate:    "Fill_Rate"
};


/**
 * Handles GET requests from the dashboard.
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const data = getData(params);
    return buildResponse({
      success: true,
      data: data,
      sheetName: CONFIG.SHEET_NAME,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return buildResponse({ success: false, error: err.message, stack: err.stack, data: [] });
  }
}


/**
 * Main data fetching + transformation.
 * Reads ALL rows from Sheet1, maps columns flexibly, returns JSON.
 */
function getData(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet '" + CONFIG.SHEET_NAME + "' not found. Available sheets: " +
      ss.getSheets().map(s => s.getName()).join(", "));
  }

  const rawData = sheet.getDataRange().getValues();
  if (rawData.length < 2) return [];

  // Build column index map with flexible matching
  const headers = rawData[0].map(h => String(h).trim());
  const idx = buildFlexibleIndexMap(headers);

  // Parse ALL rows
  const rows = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];

    // Skip truly empty rows (check first few cells)
    const mrNo = safeStr(row, idx.mrNo);
    if (!mrNo && !safeStr(row, idx.skuName) && !safeStr(row, idx.prId)) continue;

    const mrDate  = parseDate(safeVal(row, idx.mrDate));
    const prDate  = parseDate(safeVal(row, idx.prDate));
    const sku     = safeStr(row, idx.skuName);
    const wh      = safeStr(row, idx.mrWarehouse);
    const mrBy    = safeStr(row, idx.mrCreatedBy);
    const prBy    = safeStr(row, idx.prCreatedBy);
    const mrQty   = toNum(safeVal(row, idx.mrUnits));
    const prQty   = toNum(safeVal(row, idx.prQty));
    const days    = toNum(safeVal(row, idx.fillDays));
    const fill    = toNum(safeVal(row, idx.fillRate));

    // Server-side filters (optional, sent from dashboard URL params)
    if (params.from && mrDate && mrDate < params.from) continue;
    if (params.to   && mrDate && mrDate > params.to)   continue;
    if (params.sku  && sku !== params.sku)   continue;
    if (params.wh   && wh  !== params.wh)    continue;
    if (params.person && mrBy !== params.person && prBy !== params.person) continue;

    rows.push({
      mr:         mrNo,
      mrDate:     mrDate,
      prDate:     prDate,
      itemCode:   safeStr(row, idx.itemCode),
      sku:        sku,
      uom:        safeStr(row, idx.uom),
      mrQty:      mrQty,
      wh:         wh,
      prId:       safeStr(row, idx.prId),
      prQty:      prQty,
      mrId:       safeStr(row, idx.mrId),
      prCreated:  prBy,
      mrCreated:  mrBy,
      days:       days,
      fill:       fill
    });
  }

  return rows;
}


// ---------- FLEXIBLE COLUMN MATCHING ----------

/**
 * Build a {fieldKey: columnIndex} map.
 * For each expected column, tries:
 *   1. Exact match
 *   2. Match after stripping backticks from header
 *   3. Match after stripping backticks from both sides
 * If a column can't be found, its index is set to -1 (data will default to ""/0).
 */
function buildFlexibleIndexMap(headers) {
  const idx = {};
  const cleanHeaders = headers.map(h => h.replace(/`/g, '').trim());

  for (const [key, colName] of Object.entries(COLUMN_MAP)) {
    // Try exact match first
    let found = headers.indexOf(colName);

    // Try with backticks around the name: `colName`
    if (found === -1) {
      found = headers.indexOf("`" + colName + "`");
    }

    // Try matching cleaned headers (backticks stripped from sheet headers)
    if (found === -1) {
      found = cleanHeaders.indexOf(colName);
    }

    // Try case-insensitive match as last resort
    if (found === -1) {
      const lower = colName.toLowerCase();
      found = cleanHeaders.findIndex(h => h.toLowerCase() === lower);
    }

    idx[key] = found;
  }

  return idx;
}


// ---------- SAFE ACCESS HELPERS ----------

function safeVal(row, colIdx) {
  if (colIdx < 0 || colIdx >= row.length) return null;
  return row[colIdx];
}

function safeStr(row, colIdx) {
  const v = safeVal(row, colIdx);
  if (v === null || v === undefined) return "";
  return String(v).trim();
}


// ---------- HELPERS ----------

/**
 * Parse a date value from a cell into YYYY-MM-DD string.
 * Handles Date objects, strings, and various formats.
 */
function parseDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  let str = String(val).trim();
  if (str.indexOf('T') > -1) str = str.split('T')[0];

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY or DD-MM-YYYY
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s.+)?$/);
  if (m) {
    let d = m[1].length === 1 ? '0' + m[1] : m[1];
    let mo = m[2].length === 1 ? '0' + m[2] : m[2];
    return m[3] + '-' + mo + '-' + d;
  }

  // Try native Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return str.split(' ')[0];
}

/**
 * Convert a cell value to a number safely.
 */
function toNum(val) {
  if (val === null || val === undefined || val === "") return 0;
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
// TEST FUNCTION — Run manually from Apps Script editor to verify.
// Select "testScript" from the dropdown and click ▶ Run.
// ============================================================
function testScript() {
  const result = getData({});
  Logger.log("Total rows fetched: " + result.length);
  if (result.length > 0) {
    Logger.log("First row: " + JSON.stringify(result[0]));
    Logger.log("Last row: " + JSON.stringify(result[result.length - 1]));
  } else {
    Logger.log("No rows returned. Check sheet name and column headers.");
  }

  // Log the headers for debugging
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (sheet) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log("Sheet headers: " + JSON.stringify(headers.map(h => String(h).trim())));
  }
}

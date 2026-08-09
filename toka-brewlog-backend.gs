/**
 * toka-brewlog-backend.gs
 * Backend for the toka. brew log (first fermentation).
 *
 * Stores every batch as a row in a sheet called "batches" inside the
 * spreadsheet this script is bound to (the one you named "brewlog").
 *
 * Setup:
 *   1. Open the brewlog spreadsheet → Extensions → Apps Script.
 *   2. Delete any existing code, paste this file, Save.
 *   3. Deploy → New deployment → Web app → Execute as: Me →
 *      Who has access: Anyone → Deploy. Copy the /exec URL.
 *   4. Paste that URL into the app's connect screen.
 *
 * Re-deploying after an update: Deploy → Manage deployments → edit
 * (pencil) → Version: NEW VERSION → Deploy. The URL stays the same.
 *
 * Units: sugar is stored in kilograms; hot water, cold water and
 * starter liquid are stored in litres. SCOBY keeps its own value+unit.
 * On the first request after updating, this script migrates an older
 * sheet: it converts any gram/millilitre values to kg/L and removes the
 * now-unused unit columns (and a legacy "created_at" column if present).
 * It also renames a handful of primary/foreign-key columns to a
 * clearer *_pk / *_fk naming scheme (batches.uid → batch_pk, etc.) —
 * existing data is preserved, only the header cell text changes.
 *
 * Rows are returned newest-first: primary sort by date (descending),
 * tie-broken by vessel order (later vessel on top — Tank 2 above Tank 1).
 */

var SHEET_NAME = 'batches';
var BOTTLES_SHEET = 'bottles';
var INFUSIONS_SHEET = 'infusions';
var READINGS_SHEET = 'readings';
var FEEDBACK_SHEET = 'feedback';
var PRODUCTION_SHEET = 'production_tasks';

var VERSION = '27 (expenses page merged in)';

var HEADERS = [
  'batch_pk', 'batch_id', 'batch_date', 'vessel', 'total_l',
  'sugar_kg', 'sugar_source',
  'tea_g', 'tea_type', 'steep',
  'hot_l', 'cold_l', 'water_source',
  'starter_l', 'scoby_g',
  'notes', 'archived'
];

// Columns that may exist on older sheets and are no longer used.
var LEGACY_COLUMNS = ['created_at'];

// Unit columns to convert-then-drop: [value, unit, smallUnit].
// Values tagged with smallUnit are divided by 1000 (g→kg, ml→L).
var UNIT_MIGRATIONS = [
  ['sugar_value', 'sugar_unit', 'g'],
  ['hot_value', 'hot_unit', 'ml'],
  ['cold_value', 'cold_unit', 'ml'],
  ['starter_value', 'starter_unit', 'ml']
];

// Column renames applied after unit conversion: [old, new].
var RENAME_MIGRATIONS = [
  ['sugar_value', 'sugar_kg'],
  ['hot_value', 'hot_l'],
  ['cold_value', 'cold_l'],
  ['starter_value', 'starter_l'],
  ['scoby_value', 'scoby_g'],
  ['uid', 'batch_pk'],
  ['id', 'batch_id'],
  ['date', 'batch_date']
];

// Vessel display order. Used as the same-date tie-breaker.
var VESSEL_ORDER = [
  'TANK 1', 'TANK 2', 'TANK 3',
  'JAR 1', 'JAR 2', 'JAR 3', 'JAR 4', 'JAR 5', 'JAR 6', 'JAR 7', 'JAR 8'
];

// Columns for the bottling (second fermentation) sheet.
var BOTTLE_HEADERS = [
  'bottle_pk', 'bottle_id', 'batch_pk_fk', 'batch_id_ref', 'batch_date_ref',
  'bottling_date', 'fridge_date', 'volume_ml',
  'sugar_g', 'yeast_mg',
  'flavor1_name', 'flavor1_g', 'flavor2_name', 'flavor2_g',
  'flavor3_name', 'flavor3_g', 'flavor4_name', 'flavor4_g',
  'count', 'group_key', 'notes', 'archived'
];
var MAX_FLAVORS = 4;

// Column renames applied to an existing bottles sheet: [old, new].
var BOTTLE_RENAME_MIGRATIONS = [
  ['uid', 'bottle_pk'],
  ['rel_f1_uid', 'batch_pk_fk'],
  ['rel_f1_id', 'batch_id_ref'],
  ['rel_f1_date', 'batch_date_ref']
];

/* ---------- sheet helpers ---------- */

function migrateDropUnit_(sh, valueName, unitName, smallUnit) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var ui = hdr.indexOf(unitName);
  if (ui === -1) return;            // already migrated / never existed
  var vi = hdr.indexOf(valueName);
  var lastRow = sh.getLastRow();
  if (lastRow >= 2 && vi !== -1) {
    var n = lastRow - 1;
    var vals = sh.getRange(2, vi + 1, n, 1).getValues();
    var units = sh.getRange(2, ui + 1, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      var u = String(units[i][0]).toLowerCase().trim();
      var raw = vals[i][0];
      if (u === smallUnit && raw !== '' && raw != null) {
        var num = parseFloat(raw);
        if (!isNaN(num)) vals[i][0] = String(num / 1000);
      }
    }
    sh.getRange(2, vi + 1, n, 1).setValues(vals);
  }
  sh.deleteColumn(ui + 1);
}

// SCOBY is now stored in grams. Convert any kg-tagged values up (x1000),
// then drop scoby_unit. (scoby_value is renamed to scoby_g afterwards.)
function migrateScobyToGrams_(sh) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var ui = hdr.indexOf('scoby_unit');
  if (ui === -1) return;            // already migrated / never existed
  var vi = hdr.indexOf('scoby_value');
  var lastRow = sh.getLastRow();
  if (lastRow >= 2 && vi !== -1) {
    var n = lastRow - 1;
    var vals = sh.getRange(2, vi + 1, n, 1).getValues();
    var units = sh.getRange(2, ui + 1, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      var u = String(units[i][0]).toLowerCase().trim();
      var raw = vals[i][0];
      if (u === 'kg' && raw !== '' && raw != null) {
        var num = parseFloat(raw);
        if (!isNaN(num)) vals[i][0] = String(num * 1000);
      }
    }
    sh.getRange(2, vi + 1, n, 1).setValues(vals);
  }
  sh.deleteColumn(ui + 1);
}

function migrateRename_(sh, oldName, newName) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var oi = hdr.indexOf(oldName);
  if (oi === -1) return;                  // nothing to rename
  if (hdr.indexOf(newName) !== -1) return; // target already present
  sh.getRange(1, oi + 1).setNumberFormat('@').setValue(newName);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }

  // Convert g/ml values to kg/L, then drop the unit columns.
  for (var m = 0; m < UNIT_MIGRATIONS.length; m++) {
    migrateDropUnit_(sh, UNIT_MIGRATIONS[m][0], UNIT_MIGRATIONS[m][1], UNIT_MIGRATIONS[m][2]);
  }

  // Convert SCOBY to grams, then drop its unit column.
  migrateScobyToGrams_(sh);

  // Rename *_value columns to unit-suffixed names (sugar_kg, hot_l, ...),
  // and rename the primary-key / id / date columns to their new names.
  for (var rn = 0; rn < RENAME_MIGRATIONS.length; rn++) {
    migrateRename_(sh, RENAME_MIGRATIONS[rn][0], RENAME_MIGRATIONS[rn][1]);
  }

  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // Remove any legacy columns (e.g. created_at).
  for (var L = 0; L < LEGACY_COLUMNS.length; L++) {
    var li = hdr.indexOf(LEGACY_COLUMNS[L]);
    if (li !== -1) {
      sh.deleteColumn(li + 1);
      hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    }
  }

  // Append any missing current columns (e.g. archived).
  for (var h = 0; h < HEADERS.length; h++) {
    if (hdr.indexOf(HEADERS[h]) === -1) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, c).setValue(HEADERS[h]);
      hdr.push(HEADERS[h]);
    }
  }

  return sh;
}

function headerMap_(sh) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < hdr.length; i++) map[hdr[i]] = i;
  return map;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ymd_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return (val == null) ? '' : String(val);
}

function truthy_(v) {
  return v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
}

// Accept either a plain scalar or a legacy {v,u} object.
function plain_(x) {
  if (x && typeof x === 'object' && 'v' in x) return (x.v == null ? '' : x.v);
  return (x == null ? '' : x);
}
function amtV_(a) { return (a && typeof a === 'object' && a.v != null) ? a.v : ''; }
function amtU_(a) { return (a && typeof a === 'object' && a.u != null) ? a.u : ''; }

/* ---------- row <-> object ---------- */

function buildRow_(b, ncols, map) {
  b = b || {};
  var row = [];
  for (var i = 0; i < ncols; i++) row.push('');
  function set(name, value) { if (map[name] != null) row[map[name]] = value; }

  set('batch_pk', b.uid || '');
  set('batch_id', b.id || '');
  set('batch_date', b.date || '');
  set('vessel', b.vessel || '');
  set('total_l', plain_(b.totalVolume));       // L (auto = hot+cold+starter, editable)
  set('sugar_kg', plain_(b.sugar));            // kg
  set('sugar_source', b.sugarSource || '');
  set('tea_g', (b.tea == null ? '' : b.tea));
  set('tea_type', b.teaType || '');
  set('steep', b.steep || '');
  set('hot_l', plain_(b.hotWater));            // L
  set('cold_l', plain_(b.coldWater));          // L
  set('water_source', b.waterSource || '');
  set('starter_l', plain_(b.starter));         // L
  set('scoby_g', plain_(b.scoby));             // g
  set('notes', b.notes || '');
  set('archived', b.archived ? 'yes' : '');
  return row;
}

function vesselRank_(v) {
  return VESSEL_ORDER.indexOf(v); // -1 for unknown -> bottom within a date
}

function sortBatches_(a, b) {
  var da = String(a.date || ''), db = String(b.date || '');
  if (da !== db) return (da < db) ? 1 : -1;             // newer date on top
  return vesselRank_(b.vessel) - vesselRank_(a.vessel); // later vessel on top
}

function readAll_() {
  var sh = getSheet_();
  var map = headerMap_(sh);
  var data = sh.getDataRange().getValues();
  function g(r, name) { var i = map[name]; return (i == null) ? '' : r[i]; }

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!g(r, 'batch_pk') && !g(r, 'batch_id')) continue;
    out.push({
      uid: String(g(r, 'batch_pk')),
      id: g(r, 'batch_id'),
      date: ymd_(g(r, 'batch_date')),
      vessel: g(r, 'vessel'),
      totalVolume: g(r, 'total_l'),
      sugar: g(r, 'sugar_kg'),
      sugarSource: g(r, 'sugar_source'),
      tea: g(r, 'tea_g'),
      teaType: g(r, 'tea_type'),
      steep: g(r, 'steep'),
      hotWater: g(r, 'hot_l'),
      coldWater: g(r, 'cold_l'),
      waterSource: g(r, 'water_source'),
      starter: g(r, 'starter_l'),
      scoby: g(r, 'scoby_g'),
      notes: g(r, 'notes'),
      archived: truthy_(g(r, 'archived'))
    });
  }
  out.sort(sortBatches_);
  return out;
}

// Generic "find the row whose primary-key column equals val" helper,
// shared by the batches, bottles and readings sheets (each has its own
// pk column name: batch_pk / bottle_pk / reading_pk).
function findRowByKey_(sh, map, keyCol, val) {
  var data = sh.getDataRange().getValues();
  var kc = map[keyCol];
  if (kc == null) return -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][kc]) === String(val)) return i + 1;
  }
  return -1;
}

/* ---------- bottles (second fermentation) ---------- */

function getBottlesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BOTTLES_SHEET);
  if (!sh) sh = ss.insertSheet(BOTTLES_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), BOTTLE_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, BOTTLE_HEADERS.length).setValues([BOTTLE_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }

  // Rename the primary/foreign-key columns to their new names.
  for (var brn = 0; brn < BOTTLE_RENAME_MIGRATIONS.length; brn++) {
    migrateRename_(sh, BOTTLE_RENAME_MIGRATIONS[brn][0], BOTTLE_RENAME_MIGRATIONS[brn][1]);
  }

  // Ensure any newly added columns exist (forward-compatible).
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var h = 0; h < BOTTLE_HEADERS.length; h++) {
    if (hdr.indexOf(BOTTLE_HEADERS[h]) === -1) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, c).setValue(BOTTLE_HEADERS[h]);
      hdr.push(BOTTLE_HEADERS[h]);
    }
  }
  return sh;
}

function buildBottleRow_(b, ncols, map) {
  b = b || {};
  var row = [];
  for (var i = 0; i < ncols; i++) row.push('');
  function set(name, value) { if (map[name] != null) row[map[name]] = value; }

  set('bottle_pk', b.uid || '');
  set('bottle_id', b.bottleId || '');
  set('batch_pk_fk', b.relF1Uid || '');
  set('batch_id_ref', b.relF1Id || '');
  set('batch_date_ref', b.relF1Date || '');
  set('bottling_date', b.bottlingDate || '');
  set('fridge_date', b.fridgeDate || '');
  set('volume_ml', plain_(b.volumeMl));
  set('sugar_g', plain_(b.sugarG));
  set('yeast_mg', plain_(b.yeastMg));
  var fl = b.flavours || [];
  for (var f = 0; f < MAX_FLAVORS; f++) {
    var item = fl[f] || {};
    set('flavor' + (f + 1) + '_name', item.name || '');
    set('flavor' + (f + 1) + '_g', (item.g == null ? '' : item.g));
  }
  set('count', (b.count == null || b.count === '') ? '' : b.count);
  set('group_key', b.groupUid || '');
  set('notes', b.notes || '');
  set('archived', b.archived ? 'yes' : '');
  return row;
}

function sortBottles_(a, b) {
  var da = String(a.bottlingDate || ''), db = String(b.bottlingDate || '');
  if (da !== db) return (da < db) ? 1 : -1;             // newer bottling date on top
  var ia = String(a.bottleId || ''), ib = String(b.bottleId || '');
  if (ia !== ib) return (ia < ib) ? 1 : -1;             // tie-break by bottle id desc
  return 0;
}

function readAllBottles_() {
  var sh = getBottlesSheet_();
  var map = headerMap_(sh);
  var data = sh.getDataRange().getValues();
  function g(r, name) { var i = map[name]; return (i == null) ? '' : r[i]; }

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!g(r, 'bottle_pk') && !g(r, 'bottle_id')) continue;
    var flavours = [];
    for (var f = 0; f < MAX_FLAVORS; f++) {
      var nm = g(r, 'flavor' + (f + 1) + '_name');
      var gr = g(r, 'flavor' + (f + 1) + '_g');
      if ((nm !== '' && nm != null) || (gr !== '' && gr != null)) {
        flavours.push({ name: nm, g: gr });
      }
    }
    out.push({
      uid: String(g(r, 'bottle_pk')),
      bottleId: g(r, 'bottle_id'),
      relF1Uid: g(r, 'batch_pk_fk'),
      relF1Id: g(r, 'batch_id_ref'),
      relF1Date: ymd_(g(r, 'batch_date_ref')),
      bottlingDate: ymd_(g(r, 'bottling_date')),
      fridgeDate: ymd_(g(r, 'fridge_date')),
      volumeMl: g(r, 'volume_ml'),
      sugarG: g(r, 'sugar_g'),
      yeastMg: g(r, 'yeast_mg'),
      flavours: flavours,
      count: g(r, 'count'),
      groupUid: g(r, 'group_key'),
      notes: g(r, 'notes'),
      archived: truthy_(g(r, 'archived'))
    });
  }
  out.sort(sortBottles_);
  return out;
}

/* ---------- infusions (spice steep between F1 and bottling) ---------- */

var INFUSION_HEADERS = [
  'infusion_pk', 'infusion_id', 'batch_pk_fk', 'batch_id_ref', 'batch_date_ref',
  'vessel', 'volume_l', 'start_date', 'end_date',
  'flavor1_name', 'flavor1_g', 'flavor2_name', 'flavor2_g',
  'flavor3_name', 'flavor3_g', 'flavor4_name', 'flavor4_g',
  'notes', 'archived'
];

function getInfusionsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(INFUSIONS_SHEET);
  if (!sh) sh = ss.insertSheet(INFUSIONS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), INFUSION_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, INFUSION_HEADERS.length).setValues([INFUSION_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }

  // Ensure any newly added columns exist (forward-compatible).
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var h = 0; h < INFUSION_HEADERS.length; h++) {
    if (hdr.indexOf(INFUSION_HEADERS[h]) === -1) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, c).setValue(INFUSION_HEADERS[h]);
      hdr.push(INFUSION_HEADERS[h]);
    }
  }
  return sh;
}

function buildInfusionRow_(b, ncols, map) {
  b = b || {};
  var row = [];
  for (var i = 0; i < ncols; i++) row.push('');
  function set(name, value) { if (map[name] != null) row[map[name]] = value; }

  set('infusion_pk', b.uid || '');
  set('infusion_id', b.id || '');
  set('batch_pk_fk', b.relF1Uid || '');
  set('batch_id_ref', b.relF1Id || '');
  set('batch_date_ref', b.relF1Date || '');
  set('vessel', b.vessel || '');
  set('volume_l', (b.volumeL == null ? '' : b.volumeL));
  set('start_date', b.startDate || '');
  set('end_date', b.endDate || '');
  var fl = b.flavours || [];
  for (var f = 0; f < MAX_FLAVORS; f++) {
    var item = fl[f] || {};
    set('flavor' + (f + 1) + '_name', item.name || '');
    set('flavor' + (f + 1) + '_g', (item.g == null ? '' : item.g));
  }
  set('notes', b.notes || '');
  set('archived', b.archived ? 'yes' : '');
  return row;
}

function sortInfusions_(a, b) {
  var da = String(a.startDate || ''), db = String(b.startDate || '');
  if (da !== db) return (da < db) ? 1 : -1;             // newer start date on top
  var ia = String(a.id || ''), ib = String(b.id || '');
  if (ia !== ib) return (ia < ib) ? 1 : -1;
  return 0;
}

function readAllInfusions_() {
  var sh = getInfusionsSheet_();
  var map = headerMap_(sh);
  var data = sh.getDataRange().getValues();
  function g(r, name) { var i = map[name]; return (i == null) ? '' : r[i]; }

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!g(r, 'infusion_pk') && !g(r, 'infusion_id')) continue;
    var flavours = [];
    for (var f = 0; f < MAX_FLAVORS; f++) {
      var nm = g(r, 'flavor' + (f + 1) + '_name');
      var gr = g(r, 'flavor' + (f + 1) + '_g');
      if ((nm !== '' && nm != null) || (gr !== '' && gr != null)) {
        flavours.push({ name: nm, g: gr });
      }
    }
    out.push({
      uid: String(g(r, 'infusion_pk')),
      id: g(r, 'infusion_id'),
      relF1Uid: g(r, 'batch_pk_fk'),
      relF1Id: g(r, 'batch_id_ref'),
      relF1Date: ymd_(g(r, 'batch_date_ref')),
      vessel: g(r, 'vessel'),
      volumeL: g(r, 'volume_l'),
      startDate: ymd_(g(r, 'start_date')),
      endDate: ymd_(g(r, 'end_date')),
      flavours: flavours,
      notes: g(r, 'notes'),
      archived: truthy_(g(r, 'archived'))
    });
  }
  out.sort(sortInfusions_);
  return out;
}

/* ---------- readings (testing data) ---------- */

var READING_HEADERS = [
  'reading_pk', 'batch_bottle_fk', 'batch_id', 'test_date', 'brix', 'ph', 'temp', 'notes'
];

// Column renames applied to an existing readings sheet: [old, new].
var READING_RENAME_MIGRATIONS = [
  ['uid', 'reading_pk'],
  ['batch_uid', 'batch_bottle_fk'],
  ['date', 'test_date']
];

function getReadingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(READINGS_SHEET);
  if (!sh) sh = ss.insertSheet(READINGS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), READING_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, READING_HEADERS.length).setValues([READING_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }

  // Rename the primary/foreign-key/date columns to their new names.
  for (var rrn = 0; rrn < READING_RENAME_MIGRATIONS.length; rrn++) {
    migrateRename_(sh, READING_RENAME_MIGRATIONS[rrn][0], READING_RENAME_MIGRATIONS[rrn][1]);
  }

  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var h = 0; h < READING_HEADERS.length; h++) {
    if (hdr.indexOf(READING_HEADERS[h]) === -1) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, c).setValue(READING_HEADERS[h]);
      hdr.push(READING_HEADERS[h]);
    }
  }
  return sh;
}

function buildReadingRow_(r, ncols, map) {
  r = r || {};
  var row = [];
  for (var i = 0; i < ncols; i++) row.push('');
  function set(name, value) { if (map[name] != null) row[map[name]] = value; }
  set('reading_pk', r.uid || '');
  set('batch_bottle_fk', r.batchUid || '');
  set('batch_id', r.batchId || '');
  set('test_date', r.date || '');
  set('brix', plain_(r.brix));
  set('ph', plain_(r.ph));
  set('temp', plain_(r.temp));
  set('notes', r.notes || '');
  return row;
}

function sortReadings_(a, b) {
  var da = String(a.date || ''), db = String(b.date || '');
  if (da !== db) return (da < db) ? 1 : -1;        // newest reading on top
  var ia = String(a.batchId || ''), ib = String(b.batchId || '');
  if (ia !== ib) return (ia < ib) ? 1 : -1;
  return 0;
}

function readAllReadings_() {
  var sh = getReadingsSheet_();
  var map = headerMap_(sh);
  var data = sh.getDataRange().getValues();
  function g(r, name) { var i = map[name]; return (i == null) ? '' : r[i]; }

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!g(r, 'reading_pk') && !g(r, 'batch_bottle_fk') && !g(r, 'test_date')) continue;
    out.push({
      uid: String(g(r, 'reading_pk')),
      batchUid: g(r, 'batch_bottle_fk'),
      batchId: g(r, 'batch_id'),
      date: ymd_(g(r, 'test_date')),
      brix: g(r, 'brix'),
      ph: g(r, 'ph'),
      temp: g(r, 'temp'),
      notes: g(r, 'notes')
    });
  }
  out.sort(sortReadings_);
  return out;
}

/* ---------- feedback (tasting) ---------- */

var FEEDBACK_HEADERS = [
  'key', 'label', 'rating', 'fizz', 'acidity', 'sweetness', 'offflavour', 'offother', 'note', 'updated'
];

function getFeedbackSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FEEDBACK_SHEET);
  if (!sh) sh = ss.insertSheet(FEEDBACK_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), FEEDBACK_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var h = 0; h < FEEDBACK_HEADERS.length; h++) {
    if (hdr.indexOf(FEEDBACK_HEADERS[h]) === -1) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, c).setValue(FEEDBACK_HEADERS[h]);
      hdr.push(FEEDBACK_HEADERS[h]);
    }
  }
  return sh;
}

function buildFeedbackRow_(f, ncols, map) {
  f = f || {};
  var row = [];
  for (var i = 0; i < ncols; i++) row.push('');
  function set(name, value) { if (map[name] != null) row[map[name]] = value; }
  set('key', f.key || '');
  set('label', f.label || '');
  set('rating', (f.rating == null ? '' : f.rating));
  set('fizz', f.fizz || '');
  set('acidity', f.acidity || '');
  set('sweetness', f.sweetness || '');
  set('offflavour', f.offflavour || '');
  set('offother', f.offother || '');
  set('note', f.note || '');
  set('updated', f.updated || (new Date()).toISOString());
  return row;
}

function readAllFeedback_() {
  var sh = getFeedbackSheet_();
  var map = headerMap_(sh);
  var data = sh.getDataRange().getValues();
  function g(r, name) { var i = map[name]; return (i == null) ? '' : r[i]; }
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!g(r, 'key')) continue;
    out.push({
      key: String(g(r, 'key')),
      label: g(r, 'label'),
      rating: g(r, 'rating'),
      fizz: g(r, 'fizz'),
      acidity: g(r, 'acidity'),
      sweetness: g(r, 'sweetness'),
      offflavour: g(r, 'offflavour'),
      offother: g(r, 'offother'),
      note: g(r, 'note')
    });
  }
  return out;
}

function findFeedbackRowByKey_(sh, map, key) {
  return findRowByKey_(sh, map, 'key', key);
}

/* ---------- production timeline (non-brewing tasks: logistics, labelling,
   procurement, etc. — a single best-case and worst-case milestone date each,
   optionally depending on any other task, picked manually) ---------- */

var PRODUCTION_HEADERS = [
  'task_pk', 'text', 'details', 'category', 'lead', 'depends_on',
  'date_best', 'date_worst',
  'done', 'sort_order'
];

function getProductionSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PRODUCTION_SHEET);
  if (!sh) sh = ss.insertSheet(PRODUCTION_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), PRODUCTION_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, PRODUCTION_HEADERS.length).setValues([PRODUCTION_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }

  // Ensure any newly added columns exist (forward-compatible).
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var h = 0; h < PRODUCTION_HEADERS.length; h++) {
    if (hdr.indexOf(PRODUCTION_HEADERS[h]) === -1) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, c).setValue(PRODUCTION_HEADERS[h]);
      hdr.push(PRODUCTION_HEADERS[h]);
    }
  }
  return sh;
}

function buildProductionRow_(t, ncols, map) {
  t = t || {};
  var row = [];
  for (var i = 0; i < ncols; i++) row.push('');
  function set(name, value) { if (map[name] != null) row[map[name]] = value; }
  set('task_pk', t.id || '');
  set('text', t.text || '');
  set('details', t.details || '');
  set('category', t.category || '');
  set('lead', (t.leads && t.leads.length) ? t.leads.join(', ') : '');
  set('depends_on', t.dependsOn || '');
  set('date_best', t.dateBest || '');
  set('date_worst', t.dateWorst || '');
  set('done', t.done ? 'yes' : '');
  set('sort_order', (t.sortOrder == null ? '' : t.sortOrder));
  return row;
}

function sortProductionTasks_(a, b) {
  var oa = (a.sortOrder == null || a.sortOrder === '') ? 999999 : Number(a.sortOrder);
  var ob = (b.sortOrder == null || b.sortOrder === '') ? 999999 : Number(b.sortOrder);
  return oa - ob;
}

function readAllProductionTasks_() {
  var sh = getProductionSheet_();
  var map = headerMap_(sh);
  var data = sh.getDataRange().getValues();
  function g(r, name) { var i = map[name]; return (i == null) ? '' : r[i]; }

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!g(r, 'task_pk') && !g(r, 'text')) continue;
    out.push({
      id: String(g(r, 'task_pk')),
      text: g(r, 'text'),
      details: g(r, 'details'),
      category: g(r, 'category'),
      leads: String(g(r, 'lead') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      dependsOn: String(g(r, 'depends_on') || ''),
      dateBest: ymd_(g(r, 'date_best')),
      dateWorst: ymd_(g(r, 'date_worst')),
      done: truthy_(g(r, 'done')),
      sortOrder: g(r, 'sort_order')
    });
  }
  out.sort(sortProductionTasks_);
  return out;
}

/* ---------- expenses (merged from the standalone toka-expenses-backend.gs) ----------
   Kept as its own flat request-body shape (action + top-level fields, not
   nested under body.expense like batches/bottles/tasks) to match every call
   site in the ported frontend — the add form, the inline cell editor, the
   edit modal, and the automatic "linked entry" reverse reconciliation all
   already agree on that shape, so this avoids reworking a feature with real
   money data on the strength of a naming-convention preference. Actions are
   suffixed with Expense/ExpenseDeposit/ExpenseRate throughout since 'add',
   'update', 'delete' and 'getDeposits' would otherwise collide with the
   existing batch actions ('create'/'update'/'delete') below. */
var EXPENSES_SHEET = 'expenses';
var EXPENSES_SETTINGS_SHEET = 'settings';
var EXPENSES_DEPOSITS_SHEET = 'deposits';
var EXPENSES_DRIVE_FOLDER = 'toka-receipts';

function getExpensesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EXPENSES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(EXPENSES_SHEET);
    sheet.appendRow([
      'id', 'date', 'buyer', 'category', 'name', 'vendor', 'notes',
      'amountUSD', 'amountLBP', 'rateAtEntry',
      'receiptUrl', 'receiptFileId', 'receiptName', 'receiptType',
      'createdAt', 'linkedTo', 'autoNote'
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 17).setFontWeight('bold');
  }
  ensureExpenseColumns_(sheet, ['linkedTo', 'autoNote']);
  return sheet;
}

// Migrates older 'expenses' sheets to include columns added after the
// sheet was first created (mirrors the pattern getProductionSheet_ uses).
function ensureExpenseColumns_(sheet, names) {
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.indexOf(name) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(name).setFontWeight('bold');
    }
  }
}

function getOrCreateExpenseFolder_(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function readAllExpenses_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EXPENSES_SHEET);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  var headers = rows[0];
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      obj[h] = (h === 'date' && row[j] instanceof Date) ? ymd_(row[j]) : row[j];
    }
    obj._rowIndex = i + 1;
    out.push(obj);
  }
  out.reverse(); // newest first, same as the original standalone app
  return out;
}

function getExpenseDepositsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EXPENSES_DEPOSITS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(EXPENSES_DEPOSITS_SHEET);
    sh.appendRow(['uid', 'date', 'amountUSD', 'note']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  return sh;
}

function getExpenseDeposits_() {
  var sh = getExpenseDepositsSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return json_({ ok: true, deposits: [] });
  var headers = data[0];
  var deposits = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = row[j];
    if (obj.date instanceof Date) obj.date = ymd_(obj.date);
    deposits.push(obj);
  }
  return json_({ ok: true, deposits: deposits });
}

function addExpenseDeposit_(data) {
  var sh = getExpenseDepositsSheet_();
  var uid = Utilities.getUuid();
  sh.appendRow([uid, data.date, data.amountUSD, data.note || '']);
  return json_({ ok: true, uid: uid });
}

function deleteExpenseDeposit_(data) {
  var sh = getExpenseDepositsSheet_();
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var uidCol = headers.indexOf('uid');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][uidCol]) === String(data.uid)) {
      sh.deleteRow(i + 1);
      return json_({ ok: true });
    }
  }
  return json_({ ok: false, error: 'deposit not found' });
}

/* ---------- web app entry points ---------- */

function doGet(e) {
  // Writes tunneled through GET so the response is readable cross-origin
  // (see the comment on handleAction_ above).
  if (e && e.parameter && e.parameter.payload) {
    var tunneledBody;
    try {
      tunneledBody = JSON.parse(e.parameter.payload);
    } catch (payloadErr) {
      return json_({ ok: false, error: 'bad json' });
    }
    return handleAction_(tunneledBody);
  }
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'getBatches') {
    return json_({ ok: true, batches: readAll_() });
  }
  if (action === 'getBottles') {
    return json_({ ok: true, bottles: readAllBottles_() });
  }
  if (action === 'getInfusions') {
    return json_({ ok: true, infusions: readAllInfusions_() });
  }
  if (action === 'getReadings') {
    return json_({ ok: true, readings: readAllReadings_() });
  }
  if (action === 'getFeedback') {
    return json_({ ok: true, feedback: readAllFeedback_() });
  }
  if (action === 'getProductionTasks') {
    return json_({ ok: true, productionTasks: readAllProductionTasks_() });
  }
  if (action === 'getExpenses') {
    return json_({ ok: true, expenses: readAllExpenses_() });
  }
  if (action === 'getExpenseRate') {
    var erSs = SpreadsheetApp.getActiveSpreadsheet();
    var erSheet = erSs.getSheetByName(EXPENSES_SETTINGS_SHEET) || erSs.insertSheet(EXPENSES_SETTINGS_SHEET);
    var erVal = erSheet.getRange('A1').getValue();
    return json_({ ok: true, rate: erVal || 89550 });
  }
  if (action === 'getExpenseDeposits') {
    return getExpenseDeposits_();
  }
  // Combined read used by pages that need several sheets at once (Labo, To
  // Do, Lineage, Tasting, Analytics) — one request/one script invocation
  // instead of the frontend firing up to five separate ones, since each
  // invocation pays its own fixed startup cost on top of the actual sheet
  // read. The frontend falls back to the individual actions above if this
  // one isn't available yet, so redeploying is safe at any time.
  if (action === 'getAll') {
    return json_({
      ok: true,
      batches: readAll_(),
      bottles: readAllBottles_(),
      infusions: readAllInfusions_(),
      readings: readAllReadings_(),
      feedback: readAllFeedback_(),
      productionTasks: readAllProductionTasks_()
    });
  }
  return json_({ ok: true, status: 'toka-brewlog backend live', version: VERSION, supportsArchive: true });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  return handleAction_(body);
}

// Apps Script's Web App only sends a browser-readable
// Access-Control-Allow-Origin header on doGet responses (they're served via
// a redirect through script.googleusercontent.com); doPost responses are
// served directly and come back with no CORS header at all, so cross-origin
// POST requests execute fine server-side but the browser blocks the caller
// from ever reading the result. To keep writes reliable from a page hosted
// on a different origin (e.g. GitHub Pages), the frontend tunnels most
// write payloads through a GET request instead (see apiPost() in the HTML
// file) — doGet below forwards those into this same handler. doPost stays
// in place for large payloads (receipt uploads) that don't fit in a URL.
function handleAction_(body) {
  var action = body.action || '';

  // ---- expenses (see the block above readAllExpenses_ for why these keep
  // their own flat request-body shape instead of the {batch:{...}}-style
  // nesting used everywhere else below) ----
  if (action === 'getExpenseDeposits') return getExpenseDeposits_();
  if (action === 'addExpenseDeposit') return addExpenseDeposit_(body);
  if (action === 'deleteExpenseDeposit') return deleteExpenseDeposit_(body);

  if (action === 'setExpenseRate') {
    var srSs = SpreadsheetApp.getActiveSpreadsheet();
    var srSheet = srSs.getSheetByName(EXPENSES_SETTINGS_SHEET) || srSs.insertSheet(EXPENSES_SETTINGS_SHEET);
    srSheet.getRange('A1').setValue(body.rate);
    return json_({ ok: true });
  }

  if (action === 'deleteExpense') {
    var deSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EXPENSES_SHEET);
    if (!deSheet) return json_({ ok: false, error: 'Sheet not found' });
    var deRows = deSheet.getDataRange().getValues();
    var deHeaders = deRows[0];
    var deIdCol = deHeaders.indexOf('id');
    for (var dei = 1; dei < deRows.length; dei++) {
      if (String(deRows[dei][deIdCol]) === String(body.id)) {
        var deFileCol = deHeaders.indexOf('receiptFileId');
        var deFileId = deRows[dei][deFileCol];
        if (deFileId) { try { DriveApp.getFileById(deFileId).setTrashed(true); } catch (delErr) {} }
        deSheet.deleteRow(dei + 1);
        return json_({ ok: true });
      }
    }
    return json_({ ok: false, error: 'Row not found' });
  }

  if (action === 'updateExpense') {
    var ueSheet = getExpensesSheet_();
    var ueRows = ueSheet.getDataRange().getValues();
    var ueHeaders = ueRows[0];
    var ueIdCol = ueHeaders.indexOf('id');
    for (var uei = 1; uei < ueRows.length; uei++) {
      if (String(ueRows[uei][ueIdCol]) === String(body.id)) {
        var ueRowNum = uei + 1;
        (function setUpdateCols() {
          function setCol(name, value) {
            var col = ueHeaders.indexOf(name);
            if (col >= 0) ueSheet.getRange(ueRowNum, col + 1).setValue(value);
          }
          setCol('date', body.date);
          setCol('buyer', body.buyer);
          setCol('category', body.category);
          setCol('name', body.name);
          setCol('vendor', body.vendor || '');
          setCol('notes', body.notes || '');
          setCol('amountUSD', body.amountUSD);
          setCol('amountLBP', body.amountLBP);
          setCol('rateAtEntry', body.rateAtEntry);
          // only touch linkedTo/autoNote when the caller explicitly sends
          // them, so plain field edits never clobber an existing link
          if (body.linkedTo !== undefined) setCol('linkedTo', body.linkedTo || '');
          if (body.autoNote !== undefined) setCol('autoNote', body.autoNote || '');
          if (body.clearReceipt) {
            var oldFileId = ueRows[uei][ueHeaders.indexOf('receiptFileId')];
            if (oldFileId) { try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (clrErr) {} }
            setCol('receiptUrl', ''); setCol('receiptFileId', ''); setCol('receiptName', ''); setCol('receiptType', '');
          }
          if (body.receiptData && body.receiptName) {
            var oldFileId2 = ueRows[uei][ueHeaders.indexOf('receiptFileId')];
            if (oldFileId2) { try { DriveApp.getFileById(oldFileId2).setTrashed(true); } catch (repErr) {} }
            var ueFolder = getOrCreateExpenseFolder_(EXPENSES_DRIVE_FOLDER);
            var ueBlob = Utilities.newBlob(Utilities.base64Decode(body.receiptData.split(',')[1]), body.receiptType, body.receiptName);
            var ueFile = ueFolder.createFile(ueBlob);
            ueFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            setCol('receiptUrl', ueFile.getUrl());
            setCol('receiptFileId', ueFile.getId());
            setCol('receiptName', body.receiptName);
            setCol('receiptType', body.receiptType);
          }
        })();
        return json_({ ok: true });
      }
    }
    return json_({ ok: false, error: 'Row not found' });
  }

  if (action === 'addExpense') {
    var aeSheet = getExpensesSheet_();
    var aeReceiptUrl = '', aeReceiptFileId = '';
    if (body.receiptData && body.receiptName) {
      var aeFolder = getOrCreateExpenseFolder_(EXPENSES_DRIVE_FOLDER);
      var aeBlob = Utilities.newBlob(Utilities.base64Decode(body.receiptData.split(',')[1]), body.receiptType, body.receiptName);
      var aeFile = aeFolder.createFile(aeBlob);
      aeFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      aeReceiptUrl = aeFile.getUrl();
      aeReceiptFileId = aeFile.getId();
    }
    var aeId = Date.now();
    aeSheet.appendRow([
      aeId, body.date, body.buyer, body.category, body.name,
      body.vendor || '', body.notes || '',
      body.amountUSD, body.amountLBP, body.rateAtEntry,
      aeReceiptUrl, aeReceiptFileId, body.receiptName || '', body.receiptType || '',
      new Date().toISOString()
    ]);
    var aeHeadersNow = aeSheet.getRange(1, 1, 1, aeSheet.getLastColumn()).getValues()[0];
    var aeExtraCols = ['linkedTo', 'autoNote'];
    for (var aei = 0; aei < aeExtraCols.length; aei++) {
      var aeCol = aeHeadersNow.indexOf(aeExtraCols[aei]);
      if (aeCol >= 0) aeSheet.getRange(aeSheet.getLastRow(), aeCol + 1).setValue(body[aeExtraCols[aei]] || '');
    }
    return json_({ ok: true, id: aeId });
  }

  // ---- feedback (tasting) ----
  if (action === 'saveFeedback') {
    var fsh = getFeedbackSheet_();
    var fmap = headerMap_(fsh);
    var fncols = fsh.getLastColumn();
    var fb = body.feedback || {};
    var frow = findRowByKey_(fsh, fmap, 'key', fb.key);
    if (frow === -1) fsh.appendRow(buildFeedbackRow_(fb, fncols, fmap));
    else fsh.getRange(frow, 1, 1, fncols).setValues([buildFeedbackRow_(fb, fncols, fmap)]);
    return json_({ ok: true });
  }

  // ---- reading actions (testing data sheet) ----
  if (action === 'createReading' || action === 'updateReading' || action === 'deleteReading') {
    var rsh = getReadingsSheet_();
    var rmap = headerMap_(rsh);
    var rncols = rsh.getLastColumn();
    if (action === 'createReading') {
      rsh.appendRow(buildReadingRow_(body.reading || {}, rncols, rmap));
      return json_({ ok: true });
    }
    if (action === 'updateReading') {
      var rb = body.reading || {};
      var rrow = findRowByKey_(rsh, rmap, 'reading_pk', rb.uid);
      if (rrow === -1) return json_({ ok: false, error: 'not found' });
      rsh.getRange(rrow, 1, 1, rncols).setValues([buildReadingRow_(rb, rncols, rmap)]);
      return json_({ ok: true });
    }
    var rdr = findRowByKey_(rsh, rmap, 'reading_pk', body.uid);
    if (rdr === -1) return json_({ ok: false, error: 'not found' });
    rsh.deleteRow(rdr);
    return json_({ ok: true });
  }

  // ---- bottling actions (separate sheet) ----
  if (action === 'createBottle' || action === 'updateBottle' || action === 'deleteBottle') {
    var bsh = getBottlesSheet_();
    var bmap = headerMap_(bsh);
    var bncols = bsh.getLastColumn();
    if (action === 'createBottle') {
      bsh.appendRow(buildBottleRow_(body.bottle || {}, bncols, bmap));
      return json_({ ok: true });
    }
    if (action === 'updateBottle') {
      var bb = body.bottle || {};
      var brow = findRowByKey_(bsh, bmap, 'bottle_pk', bb.uid);
      if (brow === -1) return json_({ ok: false, error: 'not found' });
      bsh.getRange(brow, 1, 1, bncols).setValues([buildBottleRow_(bb, bncols, bmap)]);
      return json_({ ok: true });
    }
    var bdr = findRowByKey_(bsh, bmap, 'bottle_pk', body.uid);
    if (bdr === -1) return json_({ ok: false, error: 'not found' });
    bsh.deleteRow(bdr);
    return json_({ ok: true });
  }

  // ---- infusion actions (spice steep between F1 and bottling) ----
  if (action === 'createInfusion' || action === 'updateInfusion' || action === 'deleteInfusion') {
    var ish = getInfusionsSheet_();
    var imap = headerMap_(ish);
    var incols = ish.getLastColumn();
    if (action === 'createInfusion') {
      ish.appendRow(buildInfusionRow_(body.infusion || {}, incols, imap));
      return json_({ ok: true });
    }
    if (action === 'updateInfusion') {
      var ib = body.infusion || {};
      var irow = findRowByKey_(ish, imap, 'infusion_pk', ib.uid);
      if (irow === -1) return json_({ ok: false, error: 'not found' });
      ish.getRange(irow, 1, 1, incols).setValues([buildInfusionRow_(ib, incols, imap)]);
      return json_({ ok: true });
    }
    var idr = findRowByKey_(ish, imap, 'infusion_pk', body.uid);
    if (idr === -1) return json_({ ok: false, error: 'not found' });
    ish.deleteRow(idr);
    return json_({ ok: true });
  }

  // ---- production timeline actions ----
  if (action === 'createProductionTask' || action === 'updateProductionTask' || action === 'deleteProductionTask') {
    var psh = getProductionSheet_();
    var pmap = headerMap_(psh);
    var pncols = psh.getLastColumn();
    if (action === 'createProductionTask') {
      var newT = body.task || {};
      if (newT.sortOrder == null || newT.sortOrder === '') {
        newT.sortOrder = Math.max(0, psh.getLastRow() - 1); // append at the end
      }
      psh.appendRow(buildProductionRow_(newT, pncols, pmap));
      return json_({ ok: true });
    }
    if (action === 'updateProductionTask') {
      var ut = body.task || {};
      var urow = findRowByKey_(psh, pmap, 'task_pk', ut.id);
      if (urow === -1) return json_({ ok: false, error: 'not found' });
      psh.getRange(urow, 1, 1, pncols).setValues([buildProductionRow_(ut, pncols, pmap)]);
      return json_({ ok: true });
    }
    var pdr = findRowByKey_(psh, pmap, 'task_pk', body.id);
    if (pdr === -1) return json_({ ok: false, error: 'not found' });
    psh.deleteRow(pdr);
    return json_({ ok: true });
  }

  // Persists a new top-to-bottom order for production tasks (drag/reorder
  // arrows) — takes the full ordered list of ids and stamps sort_order 0..n
  // onto each matching row.
  if (action === 'reorderProductionTasks') {
    var rsh = getProductionSheet_();
    var rmap = headerMap_(rsh);
    var order = body.order || [];
    var pkCol = rmap['task_pk'], soCol = rmap['sort_order'];
    if (pkCol != null && soCol != null && order.length) {
      var rdata = rsh.getDataRange().getValues();
      for (var oi = 0; oi < order.length; oi++) {
        for (var di = 1; di < rdata.length; di++) {
          if (String(rdata[di][pkCol]) === String(order[oi])) {
            rsh.getRange(di + 1, soCol + 1).setValue(oi);
            break;
          }
        }
      }
    }
    return json_({ ok: true });
  }

  // ---- batch actions ----
  var sh = getSheet_();
  var map = headerMap_(sh);
  var ncols = sh.getLastColumn();

  if (action === 'create') {
    sh.appendRow(buildRow_(body.batch || {}, ncols, map));
    return json_({ ok: true });
  }

  if (action === 'update') {
    var ub = body.batch || {};
    var ur = findRowByKey_(sh, map, 'batch_pk', ub.uid);
    if (ur === -1) return json_({ ok: false, error: 'not found' });
    sh.getRange(ur, 1, 1, ncols).setValues([buildRow_(ub, ncols, map)]);
    return json_({ ok: true });
  }

  if (action === 'delete') {
    var dr = findRowByKey_(sh, map, 'batch_pk', body.uid);
    if (dr === -1) return json_({ ok: false, error: 'not found' });
    sh.deleteRow(dr);
    return json_({ ok: true });
  }

  return json_({ ok: false, error: 'unknown action' });
}

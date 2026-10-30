# toka app — context for Claude

Read this first when continuing work on the toka app.

## What it is
- **toka brewlog**: a single-file web app for Toka, a pét-nat kombucha brewery in Beirut (Claire + team: Chris, Patrick, Claude, Toka).
- Live at **https://tokabeirut.github.io/app/** (GitHub Pages).
- Files in this folder:
  - `index.html`: the whole app (HTML + CSS + JS in one file, ~13k lines).
  - `toka-brewlog-backend.gs`: Google Apps Script backend over a Google Sheet.
  - `toka-icon.png` (home-screen "t." icon), `toka-logo.png` (current logo, also embedded as base64 in index.html).

## Workflow (always)
1. Edit `index.html` / `toka-brewlog-backend.gs` in this folder.
2. Check syntax of every `<script>` block (e.g. `node -e` with `new Function`). Test logic with jsdom where useful.
3. End every change with the push command for Claire to run:
   ```
   cd ~/Documents/"1. Toka"/toka-app && git add -A && git commit -m "…" && git push
   ```
4. If the backend changed: tell Claire to redeploy Apps Script. Paste the .gs, then Deploy → Manage deployments → edit → **New version**. Bump `var VERSION` in the .gs (current: `45 …`). The live version shows at the exec URL with no action.
- Whenever the .gs changes, also send Claire the .gs file (file card) so she can paste it.
- Keep replies short. Say what changed and give the git command. Claire tests on laptop + iPhone (home-screen app).

## Backend / data
- Apps Script URL is baked into index.html as `DEFAULT_API_URL`.
- Reads: `getAll` (one combined call). Writes: `apiPost({action,…})`, routed via GET payload (small) or POST (large) → `handleAction_`.
- Sheet tabs are named after the app pages:
  - First fermentation, Infusion, Bottling, Labo, Daily operations, Bottle inventory, Spice inventory, Production timeline, Expenses, Sales, Sales lines, Customers, Bottle math, settings.
- **settings** tab:
  - A:B rows 1–3 hold the exchange rate, faucet rate and expense notes.
  - Rows 5–13 hold the invoice details.
  - Columns D:G hold the expense deposits.
- Every tab goes through `ensureSheet_(name, headers)`: created with headers if missing, missing columns appended. All one-time migrations (old tab/column names, old Sales layout, old settings layout, Bottle math C1 JSON) were removed in v43 — the live sheet is already migrated.
- First fermentation uses `scoby_l` (SCOBY litres).
- Customers have `alias` and `area` (neighbourhood, city) columns. `address` holds street/building/floor.

## Data loading
- Data loads **once per visit** (no background refresh; Claire wants it that way).
- A snapshot of the last data is shown instantly (stale badge) and editing is locked until live data arrives.
- Self-update check at startup reloads if `index.html` changed.

## Design system
- Fonts (brand kit, Google Fonts link in <head>):
  - **DM Serif Display** (regular 400, never bold): page titles and all headings.
  - **DM Sans**: everything else — body 300, labels/tabs/table headers/buttons/IDs 400–500, letter-spacing ~0.02em.
  - Numbers are DM Sans too (IBM Plex Mono removed, Oct 2026): weight 400 (a touch heavier than the 300 body text), letter-spacing 0.03em, `tabular-nums lining-nums` (set on body) so digits line up in columns. Half a point smaller than the text around them (0.95em in table cells).
  - Invoices (`invoiceHtml`): white A4 page, brand-kit fonts. Header and footer copy the price lists exactly (measured in mm): logo top left, "contact" + phone/email top right, parchment line at 47.1 mm; footer line at 263.5 mm, "storage" + storage sentence left, "drink alive." (same size, same line) right. Invoice number/date/status right under the header line. Body text smaller (≈11px). Table brand-kit style (parchment frame, light header row). Thank-you note (B2B or B2C text, same as price lists) above the footer. Terracotta only on "contact" and "storage"; other labels warm grey. The invoice-settings footer note is no longer shown.
- Colours = toka brand kit, exact hex: Charcoal `#2C2C2C` (text, IDs), Dark Amber `#4A3728` (titles, buttons/highlights that used to be orange — `--terra` now points here), Warm Grey `#8A8278` (secondary text), Parchment `#D3CBB0` (soft borders/highlights), Terracotta `#C4613A` (`--accent`) **only** for the logo dot and the active tab underline (+ chart series colour). Cream `#EDE8DA` is NOT the background yet — light background kept for now.
- **Capitals, per brand kit:** only small DM Sans labels are in widely-spaced CAPITALS — tab bar, sales sub-tabs, table column headers, field labels, figure/KPI labels, sync bar, tags and status pills (one CSS block at the end of the first <style>, "Brand kit: small DM Sans labels"). Checkbox/option labels stay lowercase. Everything else is lowercase:
- **All other interface text is lowercase** (`body { text-transform: lowercase }`) — titles, headings, buttons; data keeps its case (td, inputs, selects, `.keep-case`). Invoices are untouched.
- Page head: big title only — no subtitle/intro line on any page (hidden by CSS: `.view-bar + .content-head .content-sub`), no accent rule, no eyebrow.
- First fermentation: one "Water (hot/cold)" column, shown as `16 L (9 L + 7 L)`; click → two-field editor saving both (`waterCellHtml` / `startWaterInline`).
- Logo = `toka-logo.png` from the folder (embedded base64, header + setup screen).
- Top bar ("← back" + buttons on the right) has the same height on every page.
- Tab bar spans the full width, grouped Business | Brewing process | Operations (same order as the home page). Two-word names are stacked on two lines.
- **Every table is click-to-edit inline** (`cellEd` / `startInline` / `commitInline`; the editor overlays the cell so nothing resizes).
- Units go in field labels, e.g. "Tea (g)", never in separate unit boxes.
- Money is always shown with 2 decimals (`$ 12.50`).
- Phone numbers are shown Lebanese style: `+961 76 343 940` (`fmtPhone`).
- No tooltips unless asked (only one: recycled count on the bottle-inventory progress total).

## Pages (tab order)
- **Brewing process**
  - **First fermentation**: batch IDs are `F1-<date>-<VESSEL>`. The "split off" button creates a branch batch: ID keeps the parent's date, recipe is scaled, the parent shows "L left", and Labo shows the parent's readings up to the split.
  - **Infusion**.
  - **Bottling**:
    - Bottle IDs are `BTL-<date>-<size ml>-<spice initials>-<n>` (e.g. `BTL-20261020-750-CS-05`; size added Oct 2026, older IDs have no size). `bottleNumberFromId` skips the size via `BOTTLE_ID_SIZES`.
    - Saving a 375/750 ml bottling auto-adds a "Filled" + "Atelier" pair to Bottle inventory. Both have the note "Auto: bottled BTL-…". Flavour = spices in order, or "Unknown" if none.
    - 1000 ml bottles are not counted.
    - Column filters (Batch ID, Bottled on, Fridged, Volume, Sugar, Yeast, Spices) like the Bottle inventory log (`bfFilters`, `toggleBfMenu`); a bottle group stays when one of its bottles matches.
  - **Labo** (readings).
  - **Faucet timer**.
  - **Volume converter**: default split 2/3 375 ml, 1/3 750 ml.
- **Operations**
  - **Daily operations**: brew/infusion/fridge reminders. Fridge reminder is 4 days after bottling (`getF2Days`, default 4; per-device override key `toka_f2_days_v3`, no UI).
  - **Bottle inventory**:
    - Stages: depot / atelier / filled / sold / consumed / recycled / other.
    - One "Log a bottle movement" form.
    - Recycled bottles count into "Empty bottles at atelier".
    - Sold rows come automatically from Sales and lower "Filled bottles at atelier".
    - Flavours are stored as spices joined by spaces; shown with " • " between spices (`bivFlavourDisplay`, splits on the spice names known from Bottling/Infusion). Automatic Filled rows follow their bottling's spices on the Bottling page (`bivSyncBottlingFlavours`, on load and after Bottling reloads; also renames consumed rows and order lines that name that batch).
    - Batches: a bottling's key is `"<date>|<label>"` (label = the bottle IDs from its "Auto: bottled …" note, or "Filled by hand"); `bivBottlings()` gives every bottling with bottles left per size. Consumed (movement form) and Sales order lines pick a batch (`bivBatchOptionsHtml`, value `"<key>||<flavour>||<size>"`, or `"||<flavour>||<size>"` = any batch, default Cardamom Sumac 375 ml); the batch gives the bottle size, so there is no separate size choice there (order line `.ol-size` is hidden and synced). Stored in the `bottling` column of Bottle inventory and Sales lines (backend v45); sold/consumed with a batch come off that bottling, the rest oldest-first.
    - Movement log: a transfer's automatic counter row (depot→atelier, atelier→filled) is drawn as a small italic line under its main row (`bivPairs`); sold/consumed are one −n line; orange line between dates.
    - "Filled bottles at atelier" and each flavour row unfold (`bivToggleFlavour`, remembered per device) into the bottlings behind it (from "Auto: bottled BTL-…" notes; "Filled by hand" otherwise), showing how many of each are LEFT (sold/consumed come off their batch; any without a batch oldest-first); only bottlings with bottles left are shown.
  - **Spice inventory**:
    - Purchases minus usage, editable inline.
    - Tea is matched to First fermentation by tea type name.
    - Split-off branches are not double-counted.
  - **Production timeline**: Now / Next / Later board (no Done column) + task list.
  - **Bottle comparison** (`view-compare`, `renderCompare`, rows in `CMP_ROWS`): read-only. Pick 2–3 bottlings (a bottle group counts as one). Rows in Claire's order: volume, spices, spices per litre, sugar, sugar per litre, yeast, source · F1 / INF / F2 / total days · F1 batch, volume, SCOBY, SCOBY share, tea, tea/L, sugar, sugar/L · F1 start Brix & pH, INF end Brix & pH, BOT Brix & pH. Per-litre values are in g/L. Amount rows are only marked orange when their per-litre/share row differs too. Rows that differ are marked orange; "Only differences" toggle. Picks remembered per device (`toka_cmp_sel`).
- **Business**
  - **Expenses**.
  - **Sales** (CRM):
    - Orders with multiple product lines.
    - Invoice numbers `TOKA-YYYY-NNN`.
    - Optional "take bottles out of inventory".
    - Customers with an optional **alias**. The alias is shown instead of the official name in the overview; invoices use the official name.
    - "Time to reach out" cards: predicted next order from consumption rate; one order → +30 days; or "reorder every N days". WhatsApp and Call buttons.
    - Order line prices fill in automatically (a price typed by hand is kept): B2C uses the Bottle math bundles (`b2cBottlePrice`, flavours mixed per size). B2B uses `B2B_TIERS` per size (750 ml $7 / $6 from 12 / $5.50 from 24; 375 ml $4.50 / $4 from 18 / $3.50 from 36) over **30-day periods that start at the business's first B2B order** (not rolling): orders until start + 30 days count together; the first order after that starts a new period (`b2bPeriodStart`, `b2bWindow`).
    - 30-day volume discount: when a new B2B order brings earlier orders in the window to a lower price, the difference comes off the new order as a **rebate line** (`size: 'rebate'`, qty 0, unitPrice = amount, flavour "30-day volume discount" (+ " (exception)")); `lineTotal` makes it negative, it never counts as bottles or stock. Rebate is automatic (`b2bRebate`, minus rebates already given in the window) and can be typed over. Exception checkbox (order after the period ended): the order still counts with that period. Invoices show it as a minus line.
    - "Discount reminder" cards on Sales for B2B businesses 20–30 days into their period (deadline = period start + 30), with a WhatsApp reminder text (`crmDiscountText`).
    - Invoice details live in the settings tab.
    - Invoice PDF (`invoiceHtml`): A4, "Issued by" / "Invoiced to", no big title, number/date on the right.
  - **Bottle math**: prices as ranges (B2B/B2C) plus a B2C **bundle** per size (default 4 × 750 ml for $40, 6 × 375 ml for $36; shows price a bottle and what we keep), stored in the Bottle math sheet (bundle = row `pricing | <size> | bundle | qty | price`, backend v42).

## Naming in the app
- Flavours: "Sumac", "Cardamom Sumac" ("Base brew" was renamed to Sumac).
- Tea: e.g. "Black, CTC Malawi (Satemwa)".

## Still to do / check
- Nothing open. Backend version 41 is deployed and addresses have been moved to the new fields (Oct 21, 2026).

## Price lists
- `price-lists/toka_prices_b2b.pdf` and `price-lists/toka_prices_b2c.pdf` (in the repo, so public on the site). Downloads sit right of the Sales page title, like the caisse/spent/remaining figures on Expenses: plain grey text links "↓ download price list b2b" / "↓ download price list b2c" (`.pl-dl`). No count subtitle on Sales.
- Style: cream page, header = logo + "contact"; footer = "storage" + sentence left, "drink alive." right, same size (9pt) and same line. Terracotta only for "contact" and "storage"; prices dark amber, "750 ML/375 ML" warm grey.
- To change them, replace the PDFs in that folder (same file names).

## Access key (security)
- Backend v46: every request must carry `key` = Script property `ACCESS_KEY` (Apps Script → Project Settings → Script properties). No key set, or wrong key → `{ok:false,error:'unauthorized'}`; nothing read or written. The no-action status ping stays open.
- App: key typed once per device on the **access page** (full-screen cream, logo, "ACCESS KEY" + one field + "open toka"; no URL field, the old setup page is gone), stored in localStorage `toka_access_key_v1`, added by `api()` / `apiPost()`. An 'unauthorized' reply clears it and reopens the setup screen (`checkAuth`, `showConfig`). The web-app URL stays baked in (`DEFAULT_API_URL`) — fine, because the link alone gives no access. Never put the key in the code.
- Sync bar "lock" button (`resetConfig`): forgets the key on this device and shows the access page.
- Invoice details form: payment details and footer note fields removed; saving keeps any values already stored for them (merge, not overwrite).
- Sales top bar button reads "+ new customer".
- Bottling drawer: "Bottle number(s)" field hidden (no longer used); one bottling = one row with a quantity. Old IDs with numbers keep their number when edited.
- Expenses add/edit: "item name" and "paid to" suggest earlier entries as you type (HIST_FIELDS `expName`, `expVendor`), same dropdown as spices. Suggestion list keeps the original capitals.
- Aphrometer bottles: bottling form field "aphrometer bottles" (`b-aphro`). They stay in the bottling's count (and the fill), and one Bottle-inventory line stage 'consumed', notes "Aphrometer", linked via `bottling` key, takes them out of sellable filled stock (`syncAphrometer`, `aphroCount`). Editing the number updates/deletes that line. Shown next to the bottle count in the bottling table as a small gauge icon + number (`APHRO_ICON`, hover: "3 aphrometer bottles"). No backend change.
- Lowercase: the app's own labels (movement names, stage names, expense category options, b2b/b2c option labels, bottle-math row labels, empty-table messages, placeholders, buttons) are lowercase. **Data in tables is shown exactly as stored** (sizes, notes incl. "Auto: bottled …", channel B2B, flavours, names, IDs) — Claire changes the case in the sheet herself. Buttons: CSS `button {text-transform: inherit}`, except data buttons .crm-link/.cmp-pick-btn. Aphrometer note saved as "aphrometer" (matched case-insensitively).
- Bottle count: "filled bottles at atelier" is folded by default; clicking it shows the per-flavour rows (remembered per device, `toka_biv_filled_open`); clicking a flavour still unfolds its bottlings.
- Movement log: aphrometer "consumed" lines are drawn as a small counter line under their bottling's "filled" line (under the atelier counter line), not as their own row — unless that filled line is filtered out.
- **Values the app writes are lowercase** (backend v47 too): sizes "small (375ml)" / "big (750ml)", channel/customer type "b2b" / "b2c", notes "auto: bottled …", "sold: …", "filled: …", "aphrometer", fallback flavour "unknown". Older rows with capitals are read the same way: on load sizes/channel/type are normalised (`canonSize`, `canonChan`, `normInvRows`, `normSales`) and note prefixes are matched case-insensitively. The sold-note sync rewrites old "Sold: …" notes to "sold: …".
- Aphrometer: several aphrometer lines for one bottling are added up (`aphroEntriesFor`); editing the number in the bottling keeps one line and removes the others. Those lines keep their own date in the sheet; the log just draws them under the bottling. Flavours the app writes (fills, aphrometer) are lowercase, and batch matching compares flavours case-insensitively.
- Batch/infusion/bottle IDs (F1-…, INF-…, BTL-…) always show as saved, also outside tables: CSS rule on .id-cell, .task-id, .ftl-batch-id, .tt-head, .biv-batch-ref, .biv-btl-id, .cmp-opt-id, .cmp-link, .ov-node-label, .src-cell, .id-ref.
- Labo: no reading count ("1 reading + 6 before the split") next to each group name.
- Volume converter starts at 100% small / 0% big.

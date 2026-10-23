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
4. If the backend changed: tell Claire to redeploy Apps Script. Paste the .gs, then Deploy → Manage deployments → edit → **New version**. Bump `var VERSION` in the .gs (current: `41 …`). The live version shows at the exec URL with no action.
- Keep replies short. Say what changed and give the git command. Claire tests on laptop + iPhone (home-screen app).

## Backend / data
- Apps Script URL is baked into index.html as `DEFAULT_API_URL`.
- Reads: `getAll` (one combined call). Writes: `apiPost({action,…})`, routed via GET payload (small) or POST (large) → `handleAction_`.
- Sheet tabs are named after the app pages. Old technical names are auto-renamed by `renameLegacySheets_`:
  - First fermentation, Infusion, Bottling, Labo, Daily operations, Bottle inventory, Spice inventory, Production timeline, Expenses, Sales, Sales lines, Customers, Bottle math, settings.
- **settings** tab:
  - A:B rows 1–3 hold the exchange rate, faucet rate and expense notes.
  - Rows 5–13 hold the invoice details.
  - Columns D:G hold the expense deposits.
- Missing columns are added automatically. Legacy columns are removed via `LEGACY_COLUMNS` (e.g. `scoby_g`). First fermentation uses `scoby_l` (SCOBY litres).
- Customers have `alias` and `area` (neighbourhood, city) columns. `address` holds street/building/apt/floor.

## Data loading
- Data loads **once per visit** (no background refresh; Claire wants it that way).
- A snapshot of the last data is shown instantly (stale badge) and editing is locked until live data arrives.
- Self-update check at startup reloads if `index.html` changed.

## Design system
- Fonts:
  - **Bricolage Grotesque 700**: titles.
  - **Newsreader**: body text.
  - **IBM Plex Mono**: numbers, labels, buttons.
- Colours: ink `#1e1b18`, terra (accent) `#c0542a`, cream background.
- Page head: big title + short orange accent rule + intro line. No category eyebrow.
- Top bar ("← back" + buttons on the right) has the same height on every page.
- Tab bar spans the full width, grouped Brewing process | Operations | Business. Two-word names are stacked on two lines.
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
  - **Labo** (readings).
  - **Faucet timer**.
  - **Volume converter**: default split 2/3 375 ml, 1/3 750 ml.
- **Operations**
  - **Daily operations**: brew/infusion/fridge reminders. Fridge reminder is 5 days after bottling.
  - **Bottle inventory**:
    - Stages: depot / atelier / filled / sold / consumed / recycled / other.
    - One "Log a bottle movement" form.
    - Recycled bottles count into "Empty bottles at atelier".
    - Sold rows come automatically from Sales and lower "Filled bottles at atelier".
  - **Spice inventory**:
    - Purchases minus usage, editable inline.
    - Tea is matched to First fermentation by tea type name.
    - Split-off branches are not double-counted.
  - **Production timeline**: Now / Next / Later board (no Done column) + task list.
  - **Bottle comparison** (`view-compare`, `renderCompare`, rows in `CMP_ROWS`): read-only. Pick 2–3 bottlings (a bottle group counts as one). Rows in Claire's order: volume, spices, spices /100 ml, sugar, sugar /100 ml, yeast, source · F1 / INF / F2 / total days · F1 batch, volume, SCOBY, SCOBY share, tea, tea/L, sugar, sugar/L · F1 start Brix & pH, INF end Brix & pH, BOT Brix & pH. Per-100-ml values are in mg. Rows that differ are marked orange; "Only differences" toggle. Picks remembered per device (`toka_cmp_sel`).
- **Business**
  - **Expenses**.
  - **Sales** (CRM):
    - Orders with multiple product lines.
    - Invoice numbers `TOKA-YYYY-NNN`.
    - Optional "take bottles out of inventory".
    - Customers with an optional **alias**. The alias is shown instead of the official name in the overview; invoices use the official name.
    - "Time to reach out" cards: predicted next order from consumption rate; one order → +30 days; or "reorder every N days". WhatsApp and Call buttons.
    - Invoice details live in the settings tab.
    - Invoice PDF (`invoiceHtml`): A4, "Issued by" / "Invoiced to", no big title, number/date on the right.
  - **Bottle math**: prices as ranges (B2B/B2C), stored in the Bottle math sheet.

## Naming in the app
- Flavours: "Sumac", "Cardamom Sumac" ("Base brew" was renamed to Sumac).
- Tea: e.g. "Black, CTC Malawi (Satemwa)".

## Still to do / check
- Nothing open. Backend version 41 is deployed and addresses have been moved to the new fields (Oct 21, 2026).

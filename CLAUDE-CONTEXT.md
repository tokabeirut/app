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
   cd ~/Documents/"1. toka"/toka-app && git add -A && git commit -m "…" && git push
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
- Tab bar spans the full width, grouped Business | Operations | Brewing (same order as the home page). Two-word names are stacked on two lines.
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
  - **Bottle comparison** (`view-compare`, `renderCompare`, rows in `CMP_ROWS`): read-only. Pick 2–3 bottlings (a bottle group counts as one). Rows in Claire's order: volume, spices, spices per litre, sugar, sugar per litre, yeast, source · F1 / INF / F2 / total days · F1 batch, volume, SCOBY, SCOBY share, tea, tea/L, sugar, sugar/L · F1 start Brix & pH, INF end Brix & pH, BOT Brix & pH. Per-litre values are in g/L. Amount rows are only marked orange when their per-litre/share row differs too. Rows that differ are marked orange; "Only differences" toggle. Picks remembered per device (`toka_cmp_sel`). Pickers are the browser's own `<select>` ("BTL-… · spices", groups "active"/"archived"; slot 3 "— none —").
- **Business**
  - **Expenses**.
  - **Sales** (CRM):
    - Orders with multiple product lines.
    - Invoice numbers `TOKA-YYYY-NNN`.
    - Optional "take bottles out of inventory".
    - Customers with an optional **alias**. The alias is shown instead of the official name in the overview; invoices use the official name.
    - "Time to reach out" cards: predicted next order from consumption rate; one order → +30 days; or "reorder every N days". WhatsApp and Call buttons. Shown from 2 days after the predicted run-out date (`CRM_REACH_AFTER_DAYS`) until we reach out: the WhatsApp button or the "reached out" button (`crmReachButtons`, `markReachedOut`) saves today in the customer's `reachedOut` (Customers column reached_out, backend v57); hidden while reachedOut ≥ predicted date. No Call button on the reminder cards (reach out + discount), unless the discount reminder already lists them. Discount reminder (b2b): only on day 28–30 of the 30-day period (`B2B_REMIND_DAY` = 28), WhatsApp text about ordering now at the lower price.
    - Order line prices fill in automatically (a price typed by hand is kept): B2C uses the Bottle math bundles (`b2cBottlePrice`, flavours mixed per size). B2B uses `B2B_TIERS` per size (750 ml $7 / $6 from 12 / $5.50 from 24; 375 ml $4.50 / $4 from 18 / $3.50 from 36) over **30-day periods that start at the business's first B2B order** (not rolling): orders until start + 30 days count together; the first order after that starts a new period (`b2bPeriodStart`, `b2bWindow`).
    - 30-day volume discount: when a new B2B order brings earlier orders in the window to a lower price, the difference comes off the new order as a **rebate line** (`size: 'rebate'`, qty 0, unitPrice = amount, flavour "30-day volume discount" (+ " (exception)")); `lineTotal` makes it negative, it never counts as bottles or stock. Rebate is automatic (`b2bRebate`, minus rebates already given in the window) and can be typed over. Exception checkbox (order after the period ended): the order still counts with that period. Invoices show it as a minus line.
    - "Discount reminder" cards on Sales for B2B businesses in the last 2 days of their period (day 28–30) (deadline = period start + 30), with a WhatsApp reminder text (`crmDiscountText`).
    - Invoice details live in the settings tab.
    - Invoice PDF (`invoiceHtml`): A4, "Issued by" / "Invoiced to", no big title, number/date on the right.
  - **Bottle math**: prices as ranges (B2B/B2C) plus a B2C **bundle** per size (default 4 × 750 ml for $40, 6 × 375 ml for $36; shows price a bottle and what we keep), stored in the Bottle math sheet (bundle = row `pricing | <size> | bundle | qty | price`, backend v42).

## Naming in the app
- Flavours: "Sumac", "Cardamom Sumac" ("Base brew" was renamed to Sumac).
- Tea: e.g. "Black, CTC Malawi (Satemwa)".

## Still to do / check
- Nothing open. Backend version 41 is deployed and addresses have been moved to the new fields (Oct 21, 2026).

## Price lists
- `price-lists/toka_prices_b2b.pdf` and `price-lists/toka_prices_b2c.pdf` (in the repo, so public on the site). Downloads sit right of the Sales page title, like the caisse/spent/remaining figures on Expenses: plain grey text links "price list b2b" / "price list b2c" (`.pl-dl`) that open `price-lists/view.html?b2b|b2c` in a new tab (`openPriceList`): the sheet as a picture (`toka_prices_<kind>.jpg`, 150 dpi render of the PDF) with a bar "download pdf / close", like the invoice window. No count subtitle on Sales.
- Style: cream page, header = logo + "contact"; footer = "storage" + sentence left, "drink alive." right, same size (9pt) and same line. Terracotta only for "contact" and "storage"; prices dark amber, "750 ML/375 ML" warm grey.
- To change them, replace the PDFs in that folder (same file names) **and** the matching .jpg (render page 1 at 150 dpi, e.g. `pdftoppm -r 150 -png -singlefile`).

## Access key (security)
- Backend v46: every request must carry `key` = Script property `ACCESS_KEY` (Apps Script → Project Settings → Script properties). No key set, or wrong key → `{ok:false,error:'unauthorized'}`; nothing read or written. The no-action status ping stays open.
- App: key typed once per device on the **access page** (full-screen cream, logo, "ACCESS KEY" + one field + "open toka"; no URL field, the old setup page is gone), stored in localStorage `toka_access_key_v1`, added by `api()` / `apiPost()`. An 'unauthorized' reply clears it and reopens the setup screen (`checkAuth`, `showConfig`). The web-app URL stays baked in (`DEFAULT_API_URL`) — fine, because the link alone gives no access. Never put the key in the code.
- Sync bar "lock" button (`resetConfig`): forgets the key on this device and shows the access page.
- Invoice details form: payment details and footer note fields removed; saving keeps any values already stored for them (merge, not overwrite).
- Sales top bar button reads "+ new customer".
- Bottling drawer: "Bottle number(s)" field hidden (no longer used); one bottling = one row with a quantity. Old IDs with numbers keep their number when edited.
- Expenses add/edit: "item name" and "paid to" suggest earlier entries as you type (HIST_FIELDS `expName`, `expVendor`), same dropdown as spices. Suggestion list keeps the original capitals.
- Aphrometer bottles: bottling form field "aphrometer bottles" (`b-aphro`). They stay in the bottling's count (and the fill), and one Bottle-inventory line stage 'consumed', notes "Aphrometer", linked via `bottling` key, takes them out of sellable filled stock (`syncAphrometer`, `aphroCount`). Editing the number updates/deletes that line. Shown next to the bottle count in the bottling table as a small gauge icon + number (`APHRO_ICON`, hover: "3 aphrometer bottles"). No backend change.
- Lowercase: the app's own labels (movement names, stage names, expense category options, b2b/b2c option labels, bottle-math row labels, empty-table messages, placeholders, buttons) are lowercase. **Data in tables is shown exactly as stored** (sizes, notes incl. "Auto: bottled …", channel B2B, flavours, names, IDs) — Claire changes the case in the sheet herself. Buttons: CSS `button {text-transform: inherit}`, except data buttons .crm-link. Aphrometer note saved as "aphrometer" (matched case-insensitively).
- Bottle count: "filled bottles at atelier" is folded by default; clicking it shows the per-flavour rows (remembered per device, `toka_biv_filled_open`); clicking a flavour still unfolds its bottlings.
- Movement log: aphrometer "consumed" lines are drawn as a small counter line under their bottling's "filled" line (under the atelier counter line), not as their own row — unless that filled line is filtered out.
- **Values the app writes are lowercase** (backend v47 too): sizes "small (375ml)" / "big (750ml)", channel/customer type "b2b" / "b2c", notes "auto: bottled …", "sold: …", "filled: …", "aphrometer", fallback flavour "unknown". Older rows with capitals are read the same way: on load sizes/channel/type are normalised (`canonSize`, `canonChan`, `normInvRows`, `normSales`) and note prefixes are matched case-insensitively. The sold-note sync rewrites old "Sold: …" notes to "sold: …".
- Aphrometer: several aphrometer lines for one bottling are added up (`aphroEntriesFor`); editing the number in the bottling keeps one line and removes the others. Those lines keep their own date in the sheet; the log just draws them under the bottling. Flavours the app writes (fills, aphrometer) are lowercase, and batch matching compares flavours case-insensitively.
- Batch/infusion/bottle IDs (F1-…, INF-…, BTL-…) always show as saved, also outside tables: CSS rule on .id-cell, .task-id, .ftl-batch-id, .tt-head, .biv-batch-ref, .biv-btl-id, .cmp-link, .ov-node-label, .src-cell, .id-ref.
- Labo: no reading count ("1 reading + 6 before the split") next to each group name.
- Volume converter starts at 100% small / 0% big.
- Complimentary orders (backend v48, orders column `complimentary`): checkbox in the order drawer; all prices 0, no 30-day discount/rebate, paid row hidden (saved as paid). Bottles still leave stock as "sold". Kept out of the sales figures (revenue, bottles sold, average, unpaid) — shown as "+ N complimentary" under bottles sold — and out of the B2B 30-day window and discount reminders. Table shows a grey "Complimentary" pill; invoice status "Complimentary".
- Discounts shown openly (invoice + sales Total column): b2b products always start at the **full wholesale price** (first tier: \$ 4.50 small / \$ 7.00 big, `orderBasePrice`), b2c at the single-bottle price; every lower price is an italic discount line (b2b lines: no label; period note under the invoice table). Invoice order: 1) "rebate on earlier orders this period (TOKA-…)" with an italic line per size ("24 × 375 ml paid at \$ 4.00, now \$ 3.50 · \$ 0.50 back per bottle", `orderRebateDetail`), 2) each product at normal price with an italic line "30-day volume price (48 bottles) / bundle price / complimentary · \$ x off per bottle". Totals: normal price, rebate, discount, subtotal. Sales Total cell: normal price, italic "− \$ x rebate" / "− \$ x discount" ("free"), amount due. Helpers: `orderWindow`, `orderLineBreakdown`, `orderPriceSummary`, `orderTotalCellHtml`.
- Orders: no "take these bottles out of Bottle inventory" checkbox any more — every order saved from the drawer deducts its bottles (deductStock true). Older orders saved without it keep their "not in stock count" tag until edited.
- B2B auto-recalculation (`recalcB2bOrders`, backend v49 adds line column `manual_price`): after a b2b order is saved, deleted, made complimentary or its date changed inline, that business's **unpaid** b2b orders are recalculated in date order (30-day tier price + rebate on earlier orders, `b2bWindow` / `b2bRebate`). Paid orders are never changed but still count. Prices/rebates typed by hand in the order drawer are flagged `manualPrice` and kept.
- Order drawer batch picker (`bivBatchOptionsHtml`): matches the saved batch/flavour/size case-insensitively, and if the saved batch isn't offered any more it keeps it as an "(as saved)" option — it must never fall back to the first batch in the list (that bug turned orders 001/002 into rosewater on 31 Oct 2026).
- Aphrometer bottles also get an automatic "recycled" line (+n, notes "aphrometer", same bottling key, no flavour): the empty glass goes back into the empty stock at the atelier. `syncAphrometer` keeps both lines (consumed −n, recycled +n) in step; the movement log draws both as counter lines under the bottling's filled line.
- Label count (bottom of Bottle inventory, `bivLabelsHtml`): label pairs (front + back) purchased on 28 Oct 2026: 1333 small / 667 big (`LABEL_STOCK`; big used fixed at 36 up to 2026-11-01 via `usedUpTo`, big bottlings after that counted; counted since 2026-10-05, **cardamom sumac bottles only**); used = cardamom sumac filled bottles from that date on minus their aphrometer bottles (those get no labels); 1 bottle = 1 pair of its size; left = bought − used. Rows: "labels purchased on 28 oct 2026 (front + back)" (+n), "used labels (front + back)" (−n), then "labels still in stock" set apart under a line (`.biv-labels-total`). New label purchases: change `LABEL_STOCK` in the code.
- Flavours are compared without capitals everywhere in Bottle inventory (bottle count per flavour, batch lists); order lines and consumed movements are saved in lowercase.
- Selling only cardamom sumac for now (`SELL_FLAVOURS`): "filled bottles at atelier" counts only those flavours (breakdown too), and the order form's batch picker only offers them (`bivBatchOptionsHtml(..., sellOnly)`); other flavours stay in the movement log and the consumed form. "Any batch" on an order = oldest batch of that flavour and size with bottles left first (`bivBottlings`, FIFO).
- No "•" between spices anywhere (flavours shown as stored, e.g. "cardamom sumac"). Order batch picker: "any batch (oldest first)" group on top (default), then "batches" as "BTL-… · 30 Oct 2026 · 94 left" (no flavour while only one is on sale, no "(estimate)"); on orders only batches with bottles left, oldest first (the line's own saved batch always stays). All dropdown group labels lowercase.

## Shopify orders (index v98, backend v53)
- Orders have `delivery` ('' / 'delivery' / 'pickup'), `deliveryFee` and `shopifyOrder` (Sales columns delivery, delivery_fee, shopify_order). The fee goes to the courier: shown in the order drawer ("delivery" section) and on the invoice (Delivery line, in the invoice total), never in revenue (`orderTotal` excludes it; `orderDeliveryFee(o)`).
- Import from the Shopify staff "new order" emails (toka.beirut@gmail.com, same account as the sheet): the email template carries a hidden `[[toka-order]] … [[/toka-order]]` block of key=value lines (money in cents). Backend `syncShopifyEmails()` (time trigger every 15 min, set up by running `setupShopifySync` once in the editor; Gmail label `toka-imported`) → `parseShopifyBlock_` → `importShopifyOrder_`: skip if shopify_order already in Sales; customer matched by email or phone (`phoneKey_`: without 00/961/leading 0), else new b2c customer "from shopify"; lines: size from 375/750/small/big in title+sku, flavour cardamom sumac if title has "green amber" (its commercial name in Shopify) or cardamom/sumac; unit price = line total scaled to Shopify subtotal / qty, `manualPrice` true; unknown products → notes "not imported: …"; paid only if Shopify status "paid"; notes = customer note + "payment: <gateway>"; stock deducted as any batch (FIFO) via saveOrder_.
- Imported orders use Shopify's own order number as invoice number (`order_name`, e.g. "#1004"; fallback "#"+order); app-made orders keep TOKA-YYYY-NNN (numbering only counts those). Shopify is b2c only: imported orders are always b2c and only matched to b2c customers. Prices are always what Shopify charged (manualPrice).
- Sales page button: "sync email" (was "sync shopify"; checks Shopify + Veloz emails) (action `syncShopify`). The CSV import button was removed (index v105); backend action `importShopify` still exists but is unused.
- Template block (Shopify admin → Settings → Notifications → Staff notifications → New order → edit code, paste before the last `</body>`):
```
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#ffffff;">
[[toka-order]]<br>
order={{ order_number }}<br>
order_name={{ order_name }}<br>
date={{ created_at | date: "%Y-%m-%d" }}<br>
name={{ customer.name }}<br>
shipping_name={{ shipping_address.name }}<br>
billing_name={{ billing_address.name }}<br>
email={{ email }}<br>
phone={% if shipping_address.phone != blank %}{{ shipping_address.phone }}{% else %}{{ billing_address.phone }}{% endif %}<br>
address={{ shipping_address.address1 }} {{ shipping_address.address2 }}<br>
city={{ shipping_address.city }}<br>
delivery={{ shipping_method.title }}<br>
delivery_fee={{ shipping_price }}<br>
paid={{ financial_status }}<br>
gateway={{ unique_gateways | join: ", " }}<br>
note={{ note | strip_newlines }}<br>
subtotal={{ subtotal_price }}<br>
{% for line in line_items %}item={{ line.quantity }}|{{ line.final_line_price }}|{{ line.title }}|{{ line.variant.sku }}<br>
{% endfor %}[[/toka-order]]
</div>
```
- **Product names** (index v99): `PRODUCT_NAMES = { 'cardamom sumac': 'green amber' }`, `productName(fl)` (falls back to `bivFlavourDisplay`). Selling side shows the product name: sales order items, invoices, bottle inventory (filled breakdown, movement log flavour cell and its select labels), batch pickers ("green amber 375 ml — any batch"). Brewing side (bottling, infusion, comparison, spice inventory) keeps the spices. The sheet keeps storing "cardamom sumac" (SELL_FLAVOURS, LABEL_STOCK unchanged) and bottle IDs keep "CS". New product = one more entry in PRODUCT_NAMES (+ Shopify name match in `shopifyFlavour_` in the .gs).
- **No batch choice on orders** (index v101): the order line picker only offers product + size ("green amber 375 ml"); bottles always come off the oldest batch first (FIFO in `bivBottlings`, which still tracks bottles left per batch). A line saved earlier with a specific batch keeps it (shown "(as saved)"). The consumed form (aphrometer etc.) still picks a batch.
- Phone links (index v102, backend v54): `crmPhoneDigits` builds WhatsApp/call digits from `fmtPhone`, so Lebanese numbers typed as 03566464 / 3566464 get +961 (wa.me/9613566464). International numbers are expected with their country code (+32…, 0032… or 32…; 7–8 digits without a code = Lebanese); a "(0)" is dropped. Backend v55 `phoneKey_` does the same.
- **Stock check** (index v104): "stock check" button on Bottle inventory opens a drawer (`openStockCheck`) listing every batch of a sold flavour (SELL_FLAVOURS) with bottles left or from the last 45 days, per size, prefilled with the app's count, with live differences and size totals. Saving writes one Bottle inventory row per differing batch: stage `check`, qty = counted − app, bottling = batch key, notes "stock check", dated the count date. `bivBottlings` is now a day-by-day simulation (bottlings add; sold/consumed with a batch take from it, the rest FIFO from the oldest batch that has bottles that day; bottles out before any bottling become a debt paid by the next bottling; `check` rows correct their batch) — identical results to the old version on the live data of 3 Nov. `bivBalances` adds `checkByFlavourSize` to "filled bottles at atelier". Stage label "stock check".
- **Complimentary stock** (backend v56): a complimentary order's Bottle inventory rows are stage `consumed` with note "complimentary: <invoice> · <customer>" (still linked by order_fk; clicking opens the order). `fixComplimentaryStock_()` runs on every bottle-inventory read and flips existing rows sold↔consumed to match each order's complimentary flag.
- **Paid date** (index v106): order drawer shows "paid on" (date) under the Paid checkbox; filled with today when ticked, editable; saved as `paidDate`. The paid pill in the sales table shows "paid · <date>"; its cell (`td.crm-paid-cell`) never wraps; the paid column is 175px wide (customer 165, items 230, notes 160; table 1250px).
- **Invoice discount layout** (index v109): a discounted product line shows the discount in small grey italics just left of the normal unit price and amount ("− $ 0.50  ~~$ 4.50~~": the normal price is struck through in grey), and the line underneath shows a label in italics only when needed (b2b: none; b2c: "bundle price"; "complimentary"). When earlier orders of the 30-day period count, one italic note under the table (`.pnote`): "Your price per bottle counts everything ordered in the 30 days from <start> (TOKA-… and this order): 24 × 375 ml." with the price actually paid ($ 4.00 / $ 48.00) in the price columns (`.sd`, `tr.pay`). Rebate rows unchanged.
- **Veloz courier emails** (backend v58, index v118): every Shopify email check also runs `syncVelozEmails_()`: reads emails from withveloz.com of the last 10 days (backend v60) (no label; idempotent), `parseVelozEmail_` finds "TOK-0012 (toka-1015)" (Veloz number + ours) and the status phrase before it (order received / assigned to a driver / picked up / on the way / delivered / cancelled …; backend v61). The newest email per order wins; written to Sales columns courier_ref ("veloz TOK-0012") and courier_status. Order matched by invoice_no or shopify_order (or same digits). App: "courier reference" field in the order drawer's delivery section (editable), status hint under it; sales table notes cell shows "veloz TOK-0012 · delivered" small and muted (`.courier-ref`); bottle inventory sold rows show " · veloz TOK-0012" after their note (`bivCourierNote`, display only).
- Movement log: stock check rows sort at the top of their day (`bivStageRank`: check, recycled, sold, consumed, filled, atelier, other, depot).
- **Complimentary tab** (index v124; labelled "complimentary" since v125, code still says gifts): complimentary orders are listed under a third sales tab (`crmGiftsHtml`: same period chips; stats bottles given away by size, number of gifts and people; "+ new complimentary" opens the order drawer with complimentary ticked, title "New complimentary"; table date / given to / items / bottles / note / edit+delete). The orders tab no longer lists them (its bottles stat says "+ N given away (see complimentary)"). `customerInsights` leaves gifts out of orders/bottles/spent and the reorder estimate (`ins.gifts`, `giftN`, `giftBottles`); customers table shows "+ N complimentary" under the order count, customer drawer history a "Complimentary: N times · M bottles (dates)" line.
- **Freebies** (index v126, backend v62): the third sales tab is now "freebies" (code: gifts). Each complimentary order has `freeKind` (Sales column free_kind): 'complimentary' (a gesture to a client) or 'sample' (for a prospect to try); `freeKind(o)` defaults to complimentary. Order drawer: checkbox "Free" + radio "complimentary" / "sample for prospect" (`#o-free-kind`). Tab stats: samples (bottles, prospects, how many became clients = a real order on/after their first sample) and complimentary (bottles, gestures); buttons "+ new sample" / "+ new complimentary" (`openGiftDrawer(kind)`); table has a type column. Customers: `ins.samples` / `ins.comps`, `ins.prospect` (samples but no real order) shown as "prospect" under the type; drawer lines "Samples: …" and "Complimentary: …". Stock rows: "sample: <invoice> · <who>" or "complimentary: …" (backend + `fixComplimentaryStock_` keep the prefix in line with the kind).
- **Undone (index v129): no samples/prospects.** The third sales tab is "complimentary" again: free bottles for existing clients only (stats bottles by size, times given, to N clients; no add button (add with "+ new order" + complimentary checkbox); table date / client / items / bottles / note). Order drawer checkbox "Complimentary" (no kind choice; `freeKind(o)` is always 'complimentary'). Samples for prospects are logged as "consumed" in Bottle inventory, not in Sales. Backend v62's free_kind column stays but is always 'complimentary' (harmless; v61 works too).
- **Expenses "paid back"** (index v131, backend v63): column "Paid back" (after Receipt) with a checkbox per expense: ticked = the person who paid (buyer) was paid back; saves today's date in the Expenses column `paidBack` (created on first use) via action `setExpensePaidBack` {id, paidBack}; hover shows the date. "—" when Toka paid. Also in the CSV export.
- **Batch of a sale, set in Bottle inventory** (index v132): a sold row's flavour/batch cell is now a picker ("oldest batch first" + batches of that flavour and size with bottles left, `soldBatchOptionsHtml`); choosing one sets `bottling` on the matching order line (`saveSoldRowBatch`: same size, flavour, qty, and bottling if possible) and re-saves the order, so the backend rewrites the row with that batch. Sales never shows the batch: the order line picker shows just "green amber 375 ml" while its value keeps the batch (sellOnly branch of `bivBatchOptionsHtml`). Sold rows no longer open the order on click (open it from Sales).
- **Oldest-first batch shown per row** (index v134): `bivBottlings()` also records which batch(es) the oldest-first rule took each sold/consumed row from (`bivFifoAlloc`: row id → [[bottling key, bottles]], incl. bottles that waited for the next bottling). Rows without a chosen batch show it under the flavour in italics: "BTL-20261020-375-CS · oldest first", or "BTL-A ×2 + BTL-B ×6 · oldest first" when split. Rows with a chosen batch show that batch as before.
- Bottling table: first column (bottle ID) widened 160 → 210px (table 1391px) so group rows like "▸ BTL-20260728-104→107" no longer run into the batch ID column on a phone.
- Bottle comparison compares ingredients as shares only (index v139): spices / sugar / yeast per litre of bottle, SCOBY share, tea and sugar per litre of first fermentation; absolute amounts are hidden, volumes kept as context. Labo rows: all Brix first (F1 start, INF end, BOT), then all pH.
- **SCOBY from** (index v137, backend v64): a first fermentation batch can record which batch its SCOBY came from (`starterUid`, sheet column `starter_f1_pk`). Set in the add/edit drawer, SCOBY section, "SCOBY from" select (`starterFromOptionsHtml`: split-offs and jars first, then other batches, newest first). Under the batch ID: "scoby from JAR 3 (27 Oct)"; on the source batch: "scoby used for TANK 1 (17 Nov)".
- **SCOBY from, several** (index v138, no backend change): `starterUid` now holds a list "uid:litres;uid:litres" (an old single uid = all of SCOBY (L)), read by `starterSources(b)`. Drawer: one row per scoby (batch select + litres + ×), "+ add a scoby"; SCOBY (L) follows the sum of the litres (`syncStarterTotal`). Notes: "scoby from JAR 3 (27 Oct) · 4 L + JAR 5 (30 Oct) · 2 L"; source batch: "scoby used for TANK 1 (17 Nov) · 4 L".
- SCOBY from is not shown in the first fermentation table (index v141): only saved, visible in the batch's edit drawer.
- First fermentation and infusion tables (index v147): jars get a small split symbol (a line forking into two arrows, rotated so they point right, in terracotta #C4613A) before the batch ID (`jarMark`, `.jar-mark`; `isJarVessel(v)`); no row colouring.
- SCOBY from options show just the batch ID (index v144).
- First fermentation table (index v145): "Total" column after Batch ID (`batchTotalL`: saved total volume, else hot + cold + SCOBY; click to edit the total); the Notes column is gone from the table (notes stay in the edit drawer).
- First fermentation form (index v146): defaults tea type "CTC Assamica (Malawi • Satemwa)" and sugar "white sugar (Najjar Modern Mills)"; the water source field and table column are removed (old values stay in the sheet and are kept on save).
- Split-off details (index v147): no "split off TANK 2 on …" line under the batch ID any more; the edit drawer has a "Split off" section (split off from = batch select `parentOptionsHtml`, split date, litres) saved as parentUid / splitDate / splitLitres. The parent still shows "4 L → JAR 3 · 15 L left".
- First fermentation table (index v150): columns Batch ID, Total, Created on, Vessel, Sugar type, Sugar, Tea type, Tea, Water (hot / cold) as "34 L (8 / 26)", SCOBY. Steep time not shown in the table (still in the drawer and saved). Drawer label "Sugar type" (was Sugar source; field sugarSource).
- Volume column (index v153, header "Volume", was "Total"): a batch that had something split off shows "→ 15 L" (what is left, in terracotta, `.f1-left`) under its volume (`batchBranchNoteHtml`); nothing under the batch ID.
- First fermentation tables have fixed column widths (`.f1-table`, table-layout fixed, min 1150px, width 100%; batch ID 185, volume 75, created 110, vessel 75, sugar type 105, sugar 80, tea type 115, tea 60, water 170, scoby 75, actions 100) so no column soaks up the spare width (index v156).
- First fermentation table (index v158): sugar and tea merged into one column each, "white sugar • 2.2 kg" / "CTC Assamica • 280 g" (`typeAmountHtml`, text in brackets dropped, full type on hover); a click edits the amount, the type is edited in the drawer. Widths: batch 185, volume 75, created 110, vessel 75, sugar 175, tea 165, water 170, scoby 75, actions 100.
- Split-off rows (parentUid) in the first fermentation table show ratios instead of their share of the tank's amounts (index v159, `splitRatio`): sugar and tea in g/L of the jar's volume, SCOBY as % of the volume, water as total with hot / cold in % ("3.2 L (25% / 75%)"). Tanks keep the real amounts. Stored values unchanged; a click still edits the amount.
- "→ x L" under the volume also counts SCOBY taken from a batch (index v160): `batchRemainingL` = volume − split-offs − litres used as SCOBY in other batches (`batchScobyOutL`, from their "SCOBY from" litres); shown whenever a batch had a split-off or SCOBY taken from it (e.g. a jar partly used for a new tank).
- "→ x L" is hidden when exactly 0 L is left, and shown as "→ -2 L" when more was taken than the batch held (index v161).
- Expenses: "copy" button between edit and ✕ (`copyExpense`, index v162): adds the same expense (paid by, category, item, paid to, notes, USD) dated today, without receipt, not paid back, not linked; LBP at today's rate.
- Split symbol (index v163): only on first fermentation rows that were split off another batch (`jarMark(b)` checks `b.parentUid`), not on every jar, and no longer in the infusion table (infusions have no link to a split-off).
- Expenses category filter uses the same names as the category chips in the rows (CATS labels: production, maintenance, marketing, r&d, capex …) (index v164).
- **Search boxes** (index v165): Sales (under the tabs, all three tabs: orders/complimentary by customer, invoice, Shopify number, items, notes, courier ref, date, total, paid/unpaid; customers by name, alias, phone, email, address, area, notes) and Bottle inventory (above the movement log: date, stage, size, flavour/product, qty, notes, batch incl. oldest-first batch, order invoice/customer/courier). Every word must match (`searchHit`). The × clears it. Only the table under the box is redrawn while typing (`#sales-tab-body`, `#biv-log`) so the box keeps focus. Order stats follow the search.
- Bottle comparison Labo: 'SCOBY end Brix' / 'SCOBY end pH' rows (index v167) = last reading of the SCOBY source batch(es) (starterUid) up to the F1 brew date; shown before the F1 start rows.
- Bottle comparison takes any number of bottles (index v168): pickers side by side (300px, wrapping) = = picked ones + one empty 'add a bottle' picker; '— remove —' drops one; table min width 190 + 170 px per bottle (scrolls sideways).
- Bottle inventory: 'recycled bottles' removed from the Log a bottle movement box (index v169) — no more recycling. Existing recycled rows stay in the log (their stage picker still offers Recycled); aphrometer auto 'recycled' rows unchanged.
- Bottle inventory: new movement 'consumed empty bottles' (index v170), stage 'consumed-empty' (label 'consumed (empty)'), qty negative, no flavour/batch: subtracts from empty bottles at atelier (atelierOut), not from filled stock or FIFO. Backend unchanged (stage is free text).
- iOS Safari text autosizing turned off (html { -webkit-text-size-adjust: 100% }, index v171): it inflated some table cells (e.g. flavour 'green amber' in the movement log) on iPhone.
- Bottle inventory: sold rows' batch picker (click flavour cell) now lists every batch of that flavour/size incl. 'none left' (index v172), so FIFO can be overridden; hand-typed sold rows (no order) can also get a batch (saved on the row's bottling via updateBottleInvEntry); order rows still save on the order line.
- Movement box labels (index v173): 'depot • empty bottles sitting at the depot', 'atelier • empty bottles brought to the atelier', 'filled • bottled kombucha at the atelier, ready to sell', 'consumed • used up without a sale: tasted, given away, tested, broken'. 'consumed empty bottles' merged into consumed: its batch picker ends with an 'empty bottles' group (empty bottle 375/750 ml, value __empty__||size) which saves a consumed-empty row; log shows stage 'consumed', flavour 'empty bottle'.
- Consumed picker 'not from a batch' group (index v174): 'empty' and 'no flavour' per size (value __empty__||kind||size); both save stage consumed-empty with flavour 'empty' / 'no flavour' (off atelier empty stock); log flavour cell shows it.
- Consumed picker simplified (index v175): one 'empty' option at the end of the batch list (value __empty__); picking it shows the Size box; saves consumed-empty with flavour 'empty'. 'no flavour' dropped (plain kombucha comes from filled stock via a batch).
- Flavour pickers in bottle inventory (index v177): the two always-listed flavours are now written lowercase in the code ('cardamom sumac', 'sumac'; were 'Cardamom Sumac', 'Sumac'); other names show as stored.
- Consumed batch picker (index v178): groups 'any batch (oldest first)' (green amber 375/750 only), 'green amber batches' (sell-flavour bottlings, newest first, label = batch id · n left), 'trials' (other flavours, same labels; hand-filled ones keep flavour/size/date), 'no batch' (empty). An old row's own other-flavour 'any batch' stays offered.
- Home/nav regrouped (index v179): Business (sales, expenses, bottle math) · Stock (bottle + spice inventory) · Brewing (fermentation, infusion, bottling, labo) · Planning (daily operations, production timeline, bottle comparison — moved there in v181). 'First fermentation' page renamed 'Fermentation' (page name only; F1 IDs unchanged). Faucet timer + volume converter removed from home/nav; reachable via ghost buttons in the daily operations view bar.
- Sold-row batch picker (index v180): newest batch first, labels batch id · n left (date only for hand-filled). Consumed picker was already newest first. Rows with a chosen batch never show 'oldest first' (only FIFO rows without bottling do).
- Consumed row batch picker in the movement log (index v182): only batches / 'any batch' of the row's own bottle size (bivBatchOptionsHtml 5th param onlySize). Add form still lists both sizes (it has no size picked).
- Split drawer (index v183): the original's own vessel is offered ('TANK 2 (same vessel: the rest stays here)'); picking it prefills all litres left and may take all of it; the new branch's ID gets -B, -C… when the ID already exists (splitChildRecord makes IDs unique); if the split empties the original, the original is archived after saving.
- Home cards (index v184): 4 per row (2 below 980px, 1 on phones), padding 18px, gap 12px.
- Fermentation remaining litres (index v185): batchRemainingL also subtracts batchInfusionOutL = litres taken into infusions (amount per source if given, else the infusion's volume when it has only that one source).
- Infusion volume (index v186): '→ x L' left under the volume (infusionLeftNoteHtml) = volumeL − infusionOutL: bottlings sourced from it (count × volumeMl/1000, or the per-source amount when several sources) and other infusions sourced from it. Hidden at 0, negative shown.
- Sugar syrup (index v188, backend v65; default recipe 680 g sugar + 480 g water ≈ 910 ml, 0.75 g/ml, used until one is saved): bottling sugar field has a unit picker (ml syrup | g sugar, default ml). ml → saved as syrupMl (new bottles column syrup_ml) and sugarG = ml × g/ml from the syrup recipe (so inventory/per-L/comparison keep using grams). Old bottles stay in g. Table cell shows "x ml" (hover: grams); inline edits of syrupMl recompute sugarG. Syrup recipe card at the bottom of Daily operations (sugar g, water ml, total ml optional — else estimated water + 0.63 ml/g sugar, method text), saved via action setSyrupRecipe in script property SYRUP_RECIPE, returned by getAll as syrupRecipe.
- Bottle inventory sizes (index v189): a bottling's glass follows its fill volume — up to 375 ml = small, 376–750 ml = big (e.g. 500 ml in a 750 ml bottle takes a big bottle); only > 750 ml (1 L) stays out of inventory. Applies to the auto filled row and aphrometer rows.
- Bottling table order (index v190): date (newest first), then source batch ID (A→Z), then spices (A→Z), then notes (A→Z; v191), then bottle ID. Rows/groups can be dragged to a new place within the same bottling date (dragAttrs 'bottling'/'bottlingArch' → bottlingDrop); order saved per device in localStorage toka_bottling_order (keys g:<groupUid> / b:<uid>).
- Supply inventory page (index v192, view 'supplies', under Stock): cards like Spice inventory, in pieces. Entries share the Spice inventory sheet with unit 'pcs' (positive = bought, negative = used); spice page filters them out. Small/big labels: built-in first stock (LABEL_STOCK 1333/667, 28 Oct) + 36 big by hand up to 1 Nov, auto usage from green amber bottlings (labelUsage, aphrometer excluded). Label count section removed from Bottle inventory. Purchase drawer has a mode ('supply' → Item, pieces, bought/used).
- Supply inventory entries table (index v193): logged and built-in rows merged, newest date first.
- Sugar syrup card (index v194): editable amounts only — water (g), sugar (g), total weight (g; stored in totalMl key, recipe marked method 'fmt:weight'; older saved recipes ignored). Default 250 g water + 350 g sugar → 600 g ≈ 470 ml (volume = water part + 0.628 ml/g sugar) → 0.745 g/ml. Method text is fixed and fills in the amounts (incl. 10 ml check weight).
- Daily operations (index v195): checking a planned brew as brewed (first time) opens the new Fermentation batch drawer pre-filled from the plan (openBatchFromPlan: date, tea, sugar, steep, hot/cold water, SCOBY from brewCalc at the target volume; plan notes into notes) — pick vessel / SCOBY source and save. The recipe box under 'Planned batches' is always shown (open/close button removed).
- Brew recipe (Daily operations, index v196, backend v66): saved in the backend (script property BREW_RECIPE; action setBrewRecipe; getAll returns brewRecipe). A recipe that was only in this device's localStorage (toka_brew_recipe) is pushed up once when the backend has none. Syrup recipe was already in the backend (v65, SYRUP_RECIPE).
- Planned batches (index v198): the recipe ratios sit inside each planned brew box, under its title and above Date (recipePanelHtml called from brewBoxHtml); no separate recipe box.
- Recipe 'reset to defaults' button removed (index v199); every field change saves to the backend (setBrewRecipe).
- Recipe subtitle line removed (index v200).
- Sugar syrup card layout (index v201): sections Amounts (3 inputs in a row, 2 per row on phones) + '1 ml syrup = …' line, then Method (numbered), Check, Storage (bulleted), amounts highlighted like the brew preparation.
- Recipe 'saved to the sheet' hint removed (index v202).

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
- Sales page button: "sync shopify" (action `syncShopify`). The CSV import button was removed (index v105); backend action `importShopify` still exists but is unused.
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

# Analytics Dashboard Design

## Goal

Add an analytics view to the LyraForge admin dashboard that gives the operator a real-time picture of account-wide performance and per-client call data, built entirely on the existing call log and client JSON files.

---

## Architecture

### File structure

`admin.html` is split into separate JS files to keep each file maintainable:

- `public/admin.html` — HTML structure only; loads `/js/common.js`, `/js/admin.js`, and `/js/analytics.js` via script tags (in that order)
- `public/js/common.js` — shared utilities used by both admin.js and analytics.js: `authHeader()`, `escHtml()`, `showToast()`, the `password` variable, and the login flow
- `public/js/admin.js` — all existing pipeline, detail panel, call log, script viewer, subscription tier, and modal logic (extracted from admin.html verbatim)
- `public/js/analytics.js` — all analytics view logic: fetching, rendering cards, Chart.js charts, sortable table, search/filter, slide-in client panel
- `lib/analyticsEngine.js` — pure computation functions with in-memory caching; reads call and client JSON files; no side effects
- `routes/analytics.js` — two admin-auth protected GET endpoints
- `tests/analyticsEngine.test.js` — unit tests using temp dirs (same pattern as callStore.test.js)

`app.js` requires no middleware changes — `express.static(`public/`)` already serves the `/js/` subfolder.

### Hash routing

`admin.js` checks `window.location.hash` on load. If the hash matches a client ID (e.g. `admin.html#abc-123`), it auto-opens that client`s detail panel. The analytics "Manage Client" button opens the admin detail view in a **new tab** via `window.open('/admin#' + clientId, '_blank')` so the user keeps their analytics context.

### Chart library

Chart.js is **lazy-loaded** — not included in `admin.html` on page load. When the user opens the Analytics view for the first time, `analytics.js` dynamically inserts a script tag pointing to the Chart.js CDN URL and waits for it to load before rendering charts. Subsequent opens reuse the already-loaded library.

**Chart instance lifecycle:** A module-level variable `let activeCharts = {}` in `analytics.js` tracks all active Chart.js instances by canvas ID. Before creating any new chart, destroy the existing instance for that canvas ID if one exists (`activeCharts[id].destroy()`). This prevents "canvas already in use" errors and memory leaks when the client panel is opened, closed, and reopened for different clients.

---

## API

### GET /api/analytics/overview

**Auth:** Admin Basic Auth required

**Query params:** `range` - one of `7`, `30`, `90`, `all` (default: `30`)

**Response shape:**
- `summary.liveClients` - count of clients with status = live
- `summary.totalCalls` - total calls in range across all clients
- `summary.avgDurationMs` - average call duration across all calls in range
- `summary.sentimentBreakdown` - positive/neutral/negative as integers summing to 100
- `summary.trends` - percentage-point change vs previous equivalent period (null if insufficient data)
- `pipelineHealth` - client count per status
- `subscriptionTiers` - client count per tier
- `callVolumeByDay` - zero-filled array of date+count entries (day buckets for range<=90, week buckets for all-time)
- `clients` - all clients with call metrics and trends for the current range

sentimentBreakdown only counts calls with status=analyzed. Volume and duration count all completed calls (ended or analyzed). Clients with zero calls included with callCount=0 and null sentiment.

### GET /api/analytics/client/:id

**Auth:** Admin Basic Auth required

**Query params:** `range` - same as overview

**Response shape:**
- `summary` - totalCalls, avgDurationMs, sentimentBreakdown, disconnectionReasons, trends
- `callVolumeByDay` - zero-filled, same bucketing rules as overview
- `recentCalls` - 10 most recent calls (RECENT_CALLS_LIMIT constant), newest first, includes disconnectionReason
- `manageUrl` - `/admin#clientId` for new-tab navigation

disconnectionReasons: percentages summing to 100, calls with null reason counted as "other". Only ended/analyzed calls counted.

---

## analyticsEngine.js

Two exported functions plus cache invalidation:

```
getOverview(rangeDays)            // rangeDays: number or null for all-time
getClientAnalytics(id, rangeDays)
invalidate(clientId)              // clears cache for a specific client
```

### In-memory cache

60-second TTL. Keyed by `overview` or `client:{id}`. Cache stores result + timestamp + rangeDays. A hit requires matching both key and rangeDays.

Cache invalidation: `invalidate(clientId)` deletes `client:{clientId}` from cache. Called from the webhook handler after `call_analyzed` events. The overview cache is NOT invalidated on individual call events — it expires naturally within 60 seconds.

### Filtering logic

- `rangeDays = null` — no date filter, all calls included, chart bucketed by ISO week
- `rangeDays = N` — calls where startTimestamp >= Date.now() - N * 86400000, chart bucketed by day
- Calls with null startTimestamp — counted in totals but excluded from callVolumeByDay
- Corrupt JSON files — skipped silently, same pattern as callStore.js

### callVolumeByDay zero-fill

Every date (or week) in the range has an entry, even if count = 0. For daily: fill from today back N days. For weekly: fill from current ISO week back to earliest call week.

### Sentiment calculation

Only analyzed calls with non-null sentiment. Result integers sum to exactly 100. Rounding remainder always added to the positive bucket as the deterministic tiebreaker. Returns null if zero analyzed calls.

### Trend calculation

For rangeDays = N: compare calls in [today-N, today] vs [today-2N, today-N]. Trend = percentage-point change. Returns null when previous period has zero calls. Always null when rangeDays = null (all time).

### Duration calculation

Only calls with non-null durationMs averaged. Returns null if none.

### disconnectionReason breakdown

From ended/analyzed calls in range. Values under 1% grouped into "other". Percentages sum to 100 using positive-bucket tiebreaker.

### Performance note

Scans all client and call JSON files on every cache miss. With 60-second cache this runs at most once per minute per key. At ~50 clients x 500 calls = 25,000 files, acceptable. If cold-cache response exceeds 2 seconds, switch to pre-computed analytics stored in data/analytics/<clientId>.json updated on each call_analyzed webhook.

---

## UI

### Topbar

Add two buttons:
- **Analytics** — visible in pipeline view; hides pipeline, shows analytics, triggers first fetch
- **<- Pipeline** — visible in analytics view only; returns to Kanban view

### Analytics view layout

Top row: time range buttons [7d] [30d] [90d] [All] on the left, search input on the right

Row 2: four summary cards — Live Clients | Total Calls (with trend) | Avg Duration (with trend) | Sentiment (72% positive with trend + color bar)

Row 3: two-column panels — Pipeline Health (client count per status with color dots) | Subscription Tiers (client count per tier)

Row 4: full-width call volume chart (Chart.js bar chart, lazy-loaded)

Row 5: all-clients table with search, sort, export

**Search/filter:** Text input filters client rows client-side by business name in real-time. No re-fetch needed — all client data is in the overview response.

**Default sort:** Call count descending. Clicking any column header toggles asc/desc. Active sort column shows triangle indicator.

**Trend column:** Shows call count change vs previous equivalent period as colored percentage (green = up, red = down, gray dash = no data).

**Time range interaction:** Clicking a different time range button closes the client panel if open, then re-fetches overview with new range. Selected button is highlighted.

### Sentiment summary card

Shows "72% positive" with trend indicator. Three-segment color bar below (green/gray/red proportional to percentages).

### Slide-in client panel

Slides in from the right, same CSS pattern as existing detail panel. Closing it returns to full-width analytics without re-fetching overview.

Contents top to bottom:
- Header: business name, tier badge, status pill, close button
- Three stat cards: Total Calls (with trend), Avg Duration, Positive % (with trend)
- Call volume chart (Chart.js, 30 days or current range)
- Sentiment bar: three-segment colored bar with percentages
- Disconnection reasons: four rows (Hangup, Transfer, Machine Detected, Other) each with percentage and mini bar
- Recent calls list: 10 calls with date, duration, colored sentiment dot, summary snippet
- Footer: [Manage Client (opens new tab)] [Export CSV]

**Chart instance management:** When panel opens, destroy any existing chart for those canvas IDs before creating new ones. When panel closes, destroy chart instances and remove from activeCharts.

### Empty states

- Summary cards: show dash instead of number, trend hidden
- Call volume chart: hidden, replaced with "No calls recorded yet. Calls appear here automatically after your first Retell call."
- Clients table: "No clients yet - create your first client from the pipeline view."
- Client panel with zero calls: "No calls for this client yet." shown above recent calls
- Disconnection reasons: hidden entirely when no ended/analyzed calls exist
- Trend indicators: hidden (not shown as zero or dash) when previous period has no data

### Loading states

While fetching overview:
- Summary cards: pulsing placeholder with animated opacity
- Chart area: "Loading..." text
- Table: three placeholder rows with muted backgrounds

While fetching client panel:
- Spinner in panel header
- Stat cards show placeholders
- Chart area shows "Loading..."

### Export to CSV

**Overview table export:** Button above clients table. Downloads CSV of all currently visible rows (respects search filter and sort). Columns: Name, Tier, Status, Calls, Avg Duration (seconds), Positive %, Neutral %, Negative %, Trend.

**Per-client export:** Button in client panel footer. Downloads CSV of that client`s calls in the current range. Columns: Call ID, Date, Duration (seconds), Sentiment, Disconnection Reason, Summary.

Both generated client-side from already-fetched data using Blob URL download pattern. No additional API calls.

---

## Error handling

- 401 — analytics view shows login prompt (same as admin pipeline)
- Overview fetch fails — error message with Retry button shown in analytics view
- Client panel fetch fails — error message inside panel with Retry button
- Chart.js CDN fails to load — chart areas show "Chart unavailable - check your connection" instead of crashing
- Clients with zero calls — show in table with dash for all metrics
- Corrupt call files — skipped silently, does not affect other calls
- Calls with null startTimestamp — counted in totals, excluded from chart buckets

---

## Testing

tests/analyticsEngine.test.js covers:

1. getOverview with no clients returns zeroed summary
2. getOverview with clients but no calls returns clients with callCount=0
3. getOverview range=7 excludes calls older than 7 days
4. getOverview sentiment — only analyzed calls, integers sum to exactly 100
5. getOverview sentiment tiebreaker — remainder added to positive bucket
6. getOverview avg duration excludes null-duration calls
7. getOverview callVolumeByDay is zero-filled for all days in range
8. getOverview all-time bucketing returns week keys not day keys
9. getOverview trend calculation vs previous equivalent period
10. getOverview trend returns null when previous period has zero calls
11. getClientAnalytics returns correct per-client aggregation
12. getClientAnalytics range=null returns all calls bucketed by week
13. getClientAnalytics disconnectionReason percentages sum to 100
14. getClientAnalytics recentCalls limited to RECENT_CALLS_LIMIT
15. Cache returns same result within 60 seconds without re-reading files
16. invalidate(clientId) clears that client cache entry, not overview
17. Corrupt call file is skipped without throwing

---

## Phasing

### V1 - Build now

- analyticsEngine with 60-second cache and invalidation
- Overview and client analytics API endpoints
- admin.html split into common.js + admin.js + analytics.js
- Analytics toggle in topbar (pipeline <-> analytics)
- Summary cards with trend indicators
- Pipeline health and subscription tier panels
- Call volume chart (Chart.js lazy-loaded with instance lifecycle management)
- All-clients table with real-time search, column sorting, trend column
- Export CSV (overview table and per-client)
- Slide-in client panel with sentiment bar, disconnection reasons, recent calls
- "Manage Client" opens new tab
- Empty states and loading states for all sections
- Full test suite (17 tests)

### V2 - Future additions

- Auto-refresh every 5 minutes when tab is visible, with "Last updated Xm ago" indicator
- Pre-computed caching when on-demand response exceeds 2 seconds
- Client-facing portal with their own analytics view (Phase 2 Step 7)
- Custom date range picker beyond 7/30/90/all presets
- Goals performance tracking (requires Custom LLM WebSocket to log goal outcomes)
# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full analytics dashboard inside the LyraForge admin UI, with account-wide overview, per-client drill-down, trend indicators, disconnection reason breakdown, sortable/searchable client table, and CSV export.

**Architecture:** Backend computation in `lib/analyticsEngine.js` (pure functions, 60s in-memory cache, invalidated on webhooks); two new API endpoints in `routes/analytics.js`; frontend split from monolithic `admin.html` into `public/js/common.js` + `public/js/admin.js` + new `public/js/analytics.js`; Chart.js loaded lazily via CDN only when analytics view first opens.

**Tech Stack:** Node.js, Express, vanilla JS, Chart.js CDN, Jest for backend tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/analyticsEngine.js` | Create | Aggregation, caching, invalidation |
| `routes/analytics.js` | Create | GET /api/analytics/overview and /api/analytics/client/:id |
| `app.js` | Modify | Register analytics router |
| `routes/webhooks.js` | Modify | Call analyticsEngine.invalidate on call_analyzed |
| `public/js/common.js` | Create | Shared auth, escHtml, showToast, login, constants |
| `public/js/admin.js` | Create | All existing pipeline/detail/modal JS (extracted from admin.html) |
| `public/js/analytics.js` | Create | Full analytics view: fetch, render, Chart.js, table, panel, CSV |
| `public/admin.html` | Modify | Remove all inline JS, add script tags, add analytics HTML skeleton |
| `tests/analyticsEngine.test.js` | Create | 17 unit tests |

---

### Task 1: analyticsEngine.js — computation and caching

Implement complete analytics engine with 17 unit tests. Export getOverview(rangeDays), getClientAnalytics(id, rangeDays), invalidate(clientId). Features: 60-second cache, date range filtering, sentiment breakdown, trend calculation, zero-filled charts, disconnection reasons, duration averaging, live client counts, corrupt file handling.

---

### Task 2: API routes and app.js registration

Create `routes/analytics.js` with two admin-auth endpoints: GET /api/analytics/overview?range=7|30|90|all and GET /api/analytics/client/:id?range=7|30|90|all. Register in app.js. Verify 200 responses with correct JSON and 401 rejection.

---

### Task 3: Cache invalidation in webhook handler

Add invalidate() import to `routes/webhooks.js`. In call_analyzed handler, call invalidate(client.id) after upsertCall. Verify test suite passes.

---

### Task 4: Extract common.js and admin.js from admin.html

Extract shared utilities into `common.js`: password, authHeader(), escHtml(), showToast(), login(), constants (GOALS, TONES, VOICES, TIERS, TIER_CLASSES). Extract all pipeline/detail logic into `admin.js`. Add hash routing. Replace script block in admin.html with new script tags. Add Analytics/Pipeline buttons. Add stub showAnalytics() and showAnalyticsPipeline(). Verify admin dashboard works.

---

### Task 5: Analytics HTML, CSS, and JavaScript

Add analytics CSS to admin.html. Replace `<div id="analytics-view">` with full HTML: time range buttons, search input, 4 summary cards with trends, pipeline health panel, subscription tiers panel, call volume chart placeholder, sortable/searchable clients table, client panel skeleton.

Create `public/js/analytics.js` with: state (range, data, charts, clientsTableData, sort), main functions (setAnalyticsRange, showAnalytics, showAnalyticsPipeline, loadAnalytics, renderAnalytics, renderClientsTable, filterClientsTable, sortClientsTable, openClientPanel, closeClientPanel, renderCallVolumeChart, ensureChartJs, CSV export). Implement Chart.js lazy loading and instance cleanup. Verify in browser: toggle view, render cards/chart/table, search/sort, open panel, download CSV, manage client in new tab.

---

### Task 6: Deploy to GitHub

Copy all files to lyraforge-temp/script-generator. Commit "feat: analytics dashboard — overview, client drill-down, chart, CSV export". Push to main. Verify Railway redeploys, /api/analytics/overview responds 200 with JSON (or 401 without auth), admin dashboard works with Analytics button visible.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-analytics-dashboard.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review spec compliance, then code quality. Fast iteration with automatic quality gates.

**2. Inline Execution** — I execute tasks in this session using executing-plans skill, batch execution with checkpoints for your review.

**Which approach?**

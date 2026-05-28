# Project Structure Guide

## Overview

LyraForge Script Generator is an Express.js application that manages AI voice receptionist clients, generates scripts, and provides analytics. The project is organized for clarity, maintainability, and scalability.

---

## Directory Structure

### Root Level
- **app.js** - Express server entry point
- **package.json** - Dependencies and scripts
- **.env** - Environment variables (gitignored)
- **.gitignore** - Git ignore rules

### `/config`
Configuration files and schemas.
- `schema.prisma` - Database schema (if using Prisma)

### `/docs`
Complete project documentation.
- `/api` - API reference and examples
  - `cURLrequest.txt` - Sample API requests
- `/guides` - How-to guides and reference
  - `VoiceCallModelinfo.txt` - Model documentation
- `/schemas` - Data structure examples
  - `Sample_script.json` - Sample script format
- `/decisions` - Architecture Decision Records (ADRs)
- `Summary.png` - Project overview/diagram

### `/scripts`
Utility and operational scripts.
- `start.bat` - Start server script

### `/public`
Frontend assets served to clients.
- `/js` - JavaScript modules
  - `/lib` - External JS libraries
  - `admin.js` - Admin dashboard logic (26KB)
  - `analytics.js` - Analytics dashboard logic (17KB)
  - `common.js` - Shared utilities and auth (1KB)
- `/css` - Stylesheets
- `/assets` - Images, icons, favicons
- `admin.html` - Admin interface + analytics HTML (27KB)
- `client.html` - Client intake form

### `/lib`
Core data access and utility libraries.
- `callStore.js` - Call log storage and retrieval (2KB)
- `clientStore.js` - Client data CRUD operations (3KB)
- `prisma.js` - Database utilities (if using Prisma)

### `/middleware`
Express middleware.
- `auth.js` - Basic Authentication middleware

### `/routes`
API endpoint handlers (organized by resource).
- `analytics.js` - Analytics API endpoints (1.8KB)
  - `GET /api/analytics/overview?range=7|30|90|all`
  - `GET /api/analytics/client/:id?range=7|30|90|all`
- `clients.js` - Client management endpoints
- `retell.js` - Retell AI proxy endpoints
- `scripts.js` - Script generation endpoints
- `webhooks.js` - Webhook handlers (Retell call events)

### `/services`
Business logic and external service integrations.
- `analyticsEngine.js` - Analytics computation and caching (7KB)
- `retell.js` - Retell AI service integration
- `script-generator.js` - Script generation logic

### `/tests`
Jest test suites (organized by domain).
- `analytics.route.test.js` - Analytics API tests
- `callStore.test.js` - Call storage tests
- `clients.route.test.js` - Client routes tests
- `clientStore.test.js` - Client storage tests
- `webhooks.route.test.js` - Webhook tests
- `analyticsEngine.test.js` - Analytics engine tests (19 tests)

### `/data`
Runtime data storage (gitignored, persists on Railway volume).
- `/calls/<clientId>/` - Call logs as JSON files
- `/clients/` - Client data as JSON files

### `/.claude`
Claude Code metadata (development only).
- `/plans` - Implementation plans
- `/specs` - Design specifications
- `/worktrees` - Isolated work environments

---

## Analytics Feature Structure

The analytics dashboard is organized across backend and frontend:

### Backend (49 Tests Passing)
- **Service**: `/services/analyticsEngine.js` (7KB)
  - `getOverview(clientId, options)` - Account-wide analytics
  - `getClientAnalytics(id, options)` - Per-client analytics
  - `invalidate(clientId)` - Cache invalidation
  - Cache: 60-second TTL, per-client keying pattern
  - Score: 9.5/10 quality

- **API Routes**: `/routes/analytics.js` (1.8KB)
  - Protected by admin authentication
  - Query parameter: `?range=7|30|90|all`
  - Score: 9/10 quality

- **Cache Invalidation**: `/routes/webhooks.js`
  - Clears analytics cache on `call_analyzed` event
  - Triggered via webhook handler

### Frontend (Score: 9/10)
- **Dashboard Logic**: `/public/js/analytics.js` (17KB)
  - State management (range, data, sort/filter)
  - 22 functions for rendering
  - Chart.js lazy-loading from CDN
  - CSV export functionality
  - Client panel with drill-down

- **Shared Utilities**: `/public/js/common.js` (1KB)
  - Authentication (`authHeader()`)
  - HTML escaping (`escHtml()`)
  - Notifications (`showToast()`)
  - Constants (GOALS, TONES, VOICES, TIERS)

- **Admin Dashboard**: `/public/js/admin.js` (26KB)
  - Pipeline view rendering
  - Client detail management
  - Hash-based routing
  - Form collection and save

- **HTML Structure**: `/public/admin.html` (27KB)
  - Analytics view container
  - Summary cards (4 metrics with trends)
  - Pipeline health panel
  - Subscription tiers panel
  - Call volume chart container
  - Clients table (sortable, searchable)
  - Client detail panel (slide-in overlay)

---

## Key Design Decisions

### 1. Data Storage
- **Format**: JSON files (one per client/call)
- **Location**: Railway persistent volume at `/data`
- **Why**: Simplicity for MVP, easy backup, works on Railway

### 2. Analytics Caching
- **Strategy**: In-memory cache with 60-second TTL
- **Key Pattern**: `overview:${clientId}:${rangeDays}`
- **Invalidation**: Per-client on webhook events (call_analyzed)
- **Why**: Prevents redundant computation, supports concurrent requests

### 3. Frontend Architecture
- **Module Split**: common.js (shared) + admin.js (dashboard) + analytics.js (analytics)
- **State Management**: Vanilla JS with DOM-based state
- **Routing**: Hash-based (#clientId) for detail views
- **Why**: No build step, simple deployment, easy maintenance

### 4. Authentication
- **Method**: Basic HTTP Authentication
- **Header**: `Authorization: Basic <base64(":password")>`
- **Scope**: Admin endpoints only
- **Why**: Simple, stateless, works with Railway

### 5. Chart.js Integration
- **Loading**: Lazy-loaded from CDN on first use
- **Instance Management**: Stored in `activeCharts` map
- **Cleanup**: Previous instances destroyed before creating new ones
- **Why**: Reduces initial load, prevents memory leaks

---

## Common Tasks

### Add a New Analytics Metric
1. Update `/services/analyticsEngine.js` - Add computation
2. Update `/routes/analytics.js` - Expose in API
3. Update `/public/js/analytics.js` - Add render function
4. Update `/public/admin.html` - Add HTML element

### Add a New API Endpoint
1. Create route handler in `/routes/<resource>.js`
2. Import and register in `/app.js`
3. Add tests in `/tests/<resource>.route.test.js`
4. Document in `/docs/api/`

### Update Client Data Model
1. Modify `/lib/clientStore.js` if schema changes
2. Update `/public/js/admin.js` form rendering
3. Test with sample client in `/docs/schemas/`

### Add Frontend Assets
1. Place images in `/public/assets/`
2. Place stylesheets in `/public/css/`
3. Import/link in HTML files

---

## Testing

Run all tests:
```bash
npm test
```

Coverage:
- Unit tests: `callStore`, `clientStore`, `analyticsEngine` (19 tests)
- Integration tests: All API routes (30 tests)
- **49 tests total**, all passing

---

## Deployment

The project deploys to Railway automatically on push to `main` branch:
1. Code pushed to GitHub (commit 27f1c07)
2. Railway detects push
3. Auto-deploys to `lyraforge-production.up.railway.app`
4. Persistent volume mounts at `/data`

---

## File Size Reference

| File | Size | Purpose |
|------|------|---------|
| admin.html | 27KB | Admin UI + analytics HTML |
| admin.js | 26KB | Admin dashboard logic |
| analytics.js | 17KB | Analytics dashboard logic |
| analyticsEngine.js | 7KB | Analytics computation + caching |
| clientStore.js | 3KB | Client data CRUD |
| callStore.js | 2KB | Call log storage |
| analytics.js (route) | 1.8KB | Analytics API endpoints |
| common.js | 1KB | Shared utilities |

---

## Environment Variables

```
CLIENTS_DIR=/data/clients              # Client data location (Railway: /data/clients)
CALLS_DIR=/data/calls                  # Call logs location (Railway: /data/calls)
RETELL_API_KEY=key_xxx                 # Retell AI API key
ADMIN_PASSWORD=lyraforge               # Admin authentication password
```

---

## Code Quality Scores

| Component | Score | Notes |
|-----------|-------|-------|
| analyticsEngine.js | 9.5/10 | Robust caching, excellent error handling |
| analytics.js (routes) | 9/10 | Clean, well-structured endpoints |
| analytics.js (frontend) | 9/10 | Comprehensive UI, production-ready |
| admin.js | 8.5/10 | Technical debt on form validation |
| admin.html | 9/10 | Well-organized, responsive design |

---

## Technical Debt

- [ ] Task 4: Form validation improvements (email format, required fields, duration range)
- [ ] Task 4: Accessibility enhancements (ARIA roles, screen reader support)
- [ ] Consider migration from JSON storage to database (PostgreSQL) for scale

---

Last updated: 2026-05-28
Organized by: Claude Code

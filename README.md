# CS Server List

Lightweight Node.js server browser for Counter-Strike community servers. The app fetches server candidates from Steam, enriches them with live query metadata, and serves a browser UI for fast filtering and joining.

## Who this is for
- Community admins who want a small, self-hosted server browser.
- Players looking for curated servers with cleaner live status than raw listings.
- Maintainers who want a practical Express app without framework bloat.

## Current feature set

### Backend
- Modular structure (`config`, `routes`, `services`, `utils`).
- Refresh orchestration with bounded concurrency (`WORKER_CONCURRENCY`).
- Stale-cache protection via freshness state and `/health` degradation logic.
- Graceful shutdown with optional wait for active refresh completion.
- Snapshot restore/persist support (optional file-based cache).
- Manual refresh endpoint with optional token protection.

### Live metadata enrichment
- Ping (when available from live query).
- Player count source (`gamedig_live` vs `steam_fallback`).
- Server stability fields (`missedRefreshCount`, `stabilityState`, `lastSeenAt`, `lastRefreshAt`).
- Player-list normalization with explicit `playerListStatus` handling.

### Frontend UX
- Clean default list focused on readability.
- Advanced view toggle for technical columns/metadata.
- Expandable per-server details for deeper diagnostics.
- Favorites (local storage).
- Auto-refresh controls and countdown.
- Improved connect/copy flows.
- Safer rendering/escaping patterns.
- Desktop-friendly country flag assets + favicon.

## UI philosophy (important)
The default/collapsed main list is intentionally lightweight.

- Keep it clean and readable.
- Do **not** add technical/diagnostic/heuristic noise to the collapsed list.
- Experimental metadata and heuristics belong **only** in advanced view or expanded details.

This policy applies to future features as well.

## Getting started

### Requirements
- Node.js 18+ (recommended)
- Steam Web API key

### Install
```bash
npm install
```

### Configure environment
```bash
cp .env.example .env
```

Set at least:
- `STEAM_API_KEY` (required)

Commonly adjusted values:
- `TARGET_MAP`, `ALLOWED_COUNTRIES`, `MIN_SLOTS`, `MAX_SLOTS`
- `REFRESH_INTERVAL_MS`, `WORKER_CONCURRENCY`, `MAX_STALE_MS`
- `SNAPSHOT_CACHE_FILE`, `RESTORE_SNAPSHOT_ON_STARTUP`, `PERSIST_SNAPSHOT_ON_REFRESH`

### Run
```bash
npm start
```

Development watch mode:
```bash
npm run dev
```

Open:
- UI: `http://localhost:3000`
- API snapshot: `http://localhost:3000/api/servers`
- Health: `http://localhost:3000/health`

## Refresh model (high level)
1. Fetch candidate servers from Steam API.
2. Filter by slot limits and dedupe by server address.
3. GeoIP filter by allowed countries.
4. Query live metadata with bounded concurrency (GameDig).
5. Merge with previous cache to preserve recently-missed servers for a grace window.
6. Compute freshness/stability metadata and expose current snapshot.
7. Optionally persist snapshot to disk.

## Advanced view and expanded details
- **Advanced view**: opt-in technical visibility while keeping default list tidy.
- **Expanded details**: deeper per-server context (status fields, player-list details, metadata).

Use these surfaces for diagnostics, not the default collapsed list.

## Data limitations and variability
- Live server data can be incomplete or inconsistent between refreshes.
- Player list availability depends on per-server query behavior; some servers won’t return a list.
- Ping and metadata can fluctuate quickly.
- Some values are sourced from Steam fallback when live query data is unavailable.

## Feasibility note: “clean/vanilla” vs “probably modded” detection
A future implementation is possible, but should be treated as **heuristic**, not guaranteed truth.

Potential signals to combine:
- Tags/keywords (if available from upstream query data).
- Server name patterns.
- Map naming conventions (custom map patterns vs stock maps).
- Useful rules metadata when present.

Proposed output classes:
- `likely_clean`
- `probably_modded`
- `unknown`

Caveat:
- Skin/knife/plugin usage often cannot be determined with certainty from standard query data alone.

Critical placement rule if implemented:
- Show this classification **only** in advanced view or expanded details.
- **Never** show it in the default collapsed main list.

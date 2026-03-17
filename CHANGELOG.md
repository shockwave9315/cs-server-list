# Changelog

## v1 — Initial prototype
- Built a minimal Node.js server browser for CS community servers.
- Added Steam server-list fetch + basic filtering.
- Served a simple browser table for quick connect workflows.

## Modular backend refactor
- Split implementation into modular `config`, `services`, `routes`, and `utils` layers.
- Improved maintainability and testability without changing the lightweight runtime model.

## v2 hardening
- Added refresh lifecycle orchestration and bounded concurrency.
- Introduced stale-cache/freshness handling and a `/health` endpoint.
- Added graceful shutdown flow with in-flight refresh waiting.
- Added optional snapshot restore/persist support.
- Expanded test coverage for core services and API behavior.

## List UX improvements
- Improved sorting/filtering ergonomics and cleaner list readability.
- Added favorites and auto-refresh controls.
- Improved connect/copy interactions.

## Expandable details + advanced view
- Added advanced view for technical metadata.
- Added expandable server details for per-server diagnostics and player-list context.
- Kept default collapsed list focused on concise high-signal info.

## Runtime-quality passes on live data
- Added richer metadata fields (e.g., ping, playerCountSource, stability, lastSeenAt).
- Improved player-list normalization and fallback behavior.
- Strengthened handling for partial/inconsistent live query responses.

## Final readability polish
- Reduced noisy badge usage in default list presentation.
- Added desktop flag assets and favicon polish.
- Tuned table/status presentation for cleaner day-to-day browsing.

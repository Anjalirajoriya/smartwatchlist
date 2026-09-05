# Background jobs

Production does not refresh prices when a user opens a page. A scheduled worker should:

1. Query active stock IDs from `watchlist_items`.
2. Fetch each unique symbol once through `services/market-data.mjs`.
3. Write a `price_snapshots` row and run deterministic movement detection.
4. Ingest trusted filing/news evidence, deduplicate it, then create/update global `events`.
5. Enqueue user notifications only for attention-score thresholds.

For the hackathon, the API refresh on read provides a demo-safe version of this flow. The service/repository boundary is intentionally ready for a cron worker or BullMQ queue without changing the UI.

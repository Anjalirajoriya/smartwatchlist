# Market Memory Architecture

## Design principle

PostgreSQL is the source of truth. Redis is deliberately excluded from the hackathon runtime. Market events and evidence are global; each user's relationship to them is stored separately. This avoids duplicating the same Reliance event for thousands of watchers.

```text
React UI → API client → Express routes → controllers → services → repositories
                                      │              │             ├ PostgreSQL
                                      │              │             ├ Redis cache (future scale-up)
                                      │              │             ├ Twelve Data
                                      │              │             └ Groq (verified evidence only)
                                      └ Firebase token middleware
```

## Boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| UI components/pages | rendering and user interaction | SQL, API credentials |
| API client | HTTP, Firebase token attachment | UI state |
| Routes | URL and request validation | business rules |
| Services | market lookup, scoring, explanation policy | Express response objects |
| Repositories | parameterized PostgreSQL access | provider/network requests |
| Jobs | periodic snapshots and evidence ingestion | browser requests |

## Reliability policy

- Market provider: retry once → last PostgreSQL snapshot with a delayed marker. At scale: Redis hot-quote cache → retry once → PostgreSQL snapshot.
- No evidence: create a `DETECTED` event and say no verified reason yet.
- Groq: receives saved evidence only; its answer is cached by global event ID.
- News is evidence, not proof of causation: the product says a stock moved *after* a dated announcement, never that it moved *because of* one unless a primary filing confirms it.
- Delete watchlist item: soft delete the user↔stock relationship; shared history remains.

## Hackathon demo proof points

1. Search an NSE stock and add it; refresh to prove persistence.
2. Open its detail panel for provider-backed price history.
3. Show a `DETECTED` movement with no fabricated cause.
4. Sign in/out with Firebase; the server verifies the ID token.
5. Explain that Redis is cache-only and Postgres remains authoritative.

## Why Redis is not running in the MVP

The prototype’s traffic does not justify another runtime dependency. The market-data service and rate-limit middleware already accept a cache interface, so Redis can be enabled later for shared quote caching, hot events, distributed rate limits, and notification queues—without changing the API contract. This keeps the demo reliable while preserving a clear scaling path.

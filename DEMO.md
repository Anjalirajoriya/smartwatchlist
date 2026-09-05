# Five-minute hiring-manager demo

1. Start API and frontend. Open `/api/health` and say: *Postgres is the source of truth; Firebase verifies user identity. Redis is intentionally deferred because this MVP has no shared-load requirement yet.*
2. Sign in, search `TCS`, add it, and refresh. Explain the soft-deleted `watchlist_items` relationship.
3. Click a stock: live quote + historical series travel through the market-provider adapter, never directly from the browser.
4. Open *While you were away*. Point to the no-evidence state: the system refuses to invent a reason.
5. Show the `server/services/market-data.mjs` adapter and `ARCHITECTURE.md`: switching provider does not affect routes or UI.
6. Toggle dark mode, show settings and sign out.

## Judge answers

- **Why no microservices?** The modules have explicit boundaries, but independent scale requirements do not exist yet.
- **Why no Redis yet?** The current traffic does not justify another operational dependency. The cache boundary is already in the services, so Redis can be introduced for hot quotes, events, queues, and distributed rate limits when load makes it necessary.
- **How does it scale?** Events/evidence/explanations are global; user tables only track their relationship to shared data.
- **How do you prevent hallucination?** An unverified event cannot invoke Groq. Evidence is persisted first; its result is cached once per event.

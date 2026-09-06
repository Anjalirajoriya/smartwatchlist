# Market Memory — A Smart Market Watchlist

> Built for the Groww Hackathon — "Build a Smart Market Watchlist"

A watchlist that doesn't just show you prices. It remembers what you were watching, tells you what actually changed while you were away, and — this is the part I care about most — **refuses to invent a reason for a price move it can't verify.**

---

## Table of Contents

- [Problem Statement](#the-problem-i-chose-to-solve)
- [Design Principles](#design-principles)
- [My Thought Process](#my-thought-process)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [How Each Feature Actually Works](#how-each-feature-actually-works)
- [Tech Stack — and Why](#tech-stack--and-why)
- [What I Deliberately Didn't Build (Yet)](#what-i-deliberately-didnt-build-yet)
- [How to Run This](#how-to-run-this)
- [Demo Walkthrough](#demo-walkthrough)
- [Anticipated Questions](#anticipated-questions)

---

## The Problem to Solve

The brief was open-ended on purpose: build a watchlist, decide what "meaningful change" means, decide what to surface, decide how it scales. The obvious version of this product is a list of stocks with live prices ticking up and down. I didn't want to build that.

The real problem with watchlists isn't that they lack data — it's that they give you **too much noise and too little judgment**. A stock moving 0.3% and a stock moving 8% look the same on most apps: just a number changing color. And when something *does* move meaningfully, most apps either say nothing, or worse, an AI-generated explanation shows up that sounds confident but is quietly making things up.

So I reframed the brief as: **build a system that has a memory, a sense of judgment about what deserves attention, and enough intellectual honesty to say "I don't know why this happened" when that's the truth.**

That last part — the honesty — became the core design constraint for everything else.

---

## Design Principles

I anchored every decision in Groww's stated principles, translated into concrete engineering constraints:

| Groww principle | What it meant for this build |
|---|---|
| **Simple** | One clear data flow per feature. No technology added without a specific problem it solves — I can justify every dependency in this repo. |
| **Responsible** | Never fabricate a cause for a price move. Never call something "advice." Never show fake live data when the market is closed or the API is down. |
| **Delightful** | "While you were away" as a narrative timeline, not a table. Soft-deletes so removing a stock doesn't erase your history with it. |
| **Reliability, Always** | Every external dependency (market API, news API, LLM) has a fallback path that degrades gracefully instead of crashing or lying. |
| **Being Transparent** | Every explanation states its evidence source. Every stale price is labeled stale. Every unverified move says so explicitly. |
| **Thinking Long-Term** | The architecture is layered so today's simple choices (Postgres-only, no queue, no microservices) can evolve without a rewrite — see [What I Deliberately Didn't Build](#what-i-deliberately-didnt-build-yet). |

---

## My Thought Process

**1. What counts as "meaningful change"?**
I rejected "any price change" and "an LLM decides" almost immediately — the first is noise, the second is unpredictable and expensive. I landed on a deterministic formula instead:

```
abnormal_movement = stock_return − sector_return
```

If a stock and its whole sector both move 3%, that's the market, not news about that company. If a stock moves 5% while its sector moves 0.5%, that's abnormal — and abnormal is what deserves investigation. This is boring, explainable math, which is exactly what I wanted for a financial product. I'd rather defend a threshold in an interview than defend "the AI felt like it was important."

**2. How do I explain *why* something moved, without hallucinating?**
This was the crux of the whole project. My rule: **an event cannot have an explanation until it has evidence.** Evidence means a dated, sourced news article or filing that I can point to. So the pipeline is:

```
Price movement crosses threshold
        ↓
Deterministic attention score computed
        ↓
GNews searched for dated articles near that timestamp
        ↓
Found?  → event becomes VERIFIED, article stored as evidence
Not found? → event stays DETECTED, UI says "no verified reason yet"
```

Only a `VERIFIED` event is ever allowed to reach an LLM. A `DETECTED` event with no evidence never gets an AI-generated explanation — because there'd be nothing true for the AI to say. This single rule is, I think, the strongest thing in this project.

**3. Should the LLM run automatically, or on demand?**
Originally I considered auto-generating an explanation for every verified event. Then I did the math: if 10,000 users each watch overlapping stocks, and each verified event triggers an LLM call, that's a lot of tokens spent explaining the *same event* to *the same fact pattern* over and over.

I moved to a two-tier model:
- **Tier 1 (default, free):** a template sentence built directly from verified evidence — *"{stock} moved {pct}% after {headline}, reported by {source}."* Zero LLM cost, zero hallucination risk, instant.
- **Tier 2 (on-demand):** if a user wants more — clicks "Explain more" or types a specific question like *"what was announced?"* — **that's** when Groq gets called, exactly once per unique (event, question) pair, with the answer cached in Postgres afterward. The 10,001st person to ask the same question gets the cached answer, not a new LLM call.

This felt like the right way to use AI in a financial product: as an optional clarification layer for a human who wants to dig deeper, not as the thing quietly generating "facts" for everyone by default.

**4. Why global events instead of per-user events?**
Early on I almost modeled events as belonging to a user (since that's how the watchlist itself works). I caught this before building it: if 100,000 users watch Reliance and Reliance has an earnings event, I do not want 100,000 copies of that event, 100,000 evidence rows, or worst case 100,000 LLM calls. So events, evidence, and explanations are **global** — one row, shared by everyone. A separate lightweight `user_event_state` table tracks the only thing that's actually per-user: *has this person seen it, dismissed it, been notified about it.* This is the single biggest scalability decision in the schema.

**5. What happens when a user removes a stock, then wants it back?**
I didn't want a hard delete, because that throws away a real relationship the user had with that stock — including any events they might want to look back on. So removing a stock is a **soft delete** (`removed_at` timestamp set, row otherwise untouched). If they re-add the same stock later, the system restores the same row instead of creating a duplicate, and can even say "welcome back — here's what happened since you left."

**6. What happens when data isn't available?**
I decided early that this product should never *pretend*. If the market API times out, I show the last known price with a visible "delayed" badge — never a fabricated live number. If the market is closed, I say so instead of showing a flat 0.00% as if trading were happening. If GNews finds nothing, I say "no verified reason yet" instead of guessing. This is a direct expression of "Responsible" and "Being Transparent" as literal UI states, not just marketing language.

---

## Architecture

```
React UI → API client → Express routes → controllers → services → repositories
                                      │              │             ├ PostgreSQL (source of truth)
                                      │              │             ├ Redis (optional cache, never authoritative)
                                      │              │             ├ Market data provider (Yahoo Finance)
                                      │              │             ├ GNews (evidence ingestion)
                                      │              │             └ Groq (on-demand explanation only)
                                      └ Firebase token verification middleware
```

**Why this shape, specifically:**

- **PostgreSQL is the single source of truth.** The data is genuinely relational — a user's relationship to a stock, a stock's relationship to events, an event's relationship to evidence. Forcing this into a document store would mean re-implementing joins in application code for no benefit. I deliberately did *not* add MongoDB alongside Postgres for "flexible" profile data — that would just be two sources of truth for a problem a single `JSONB` column already solves.
- **Redis is a cache, never a source of truth.** If Redis is down, the app should degrade — read straight from Postgres/the market API — not crash. I built the Redis wrapper to fail silently and fall through, on purpose.
- **Firebase handles identity only.** I didn't want to spend hackathon hours reimplementing password hashing, reset flows, and email verification — Firebase Auth already solves this well, and "OAuth" isn't a separate decision from Firebase, since Firebase already implements OAuth under the hood for Google sign-in.
- **The market data provider sits behind one adapter file.** Every other part of the system calls `market-data.mjs`, never the provider's API directly. This means the provider (currently Yahoo Finance) can be swapped for a paid/more reliable one later without touching a single route or UI component.
- **Evidence and explanation are separated from detection.** Detection (is this move abnormal?) is pure math. Evidence (why did it happen?) is a separate ingestion step that can fail independently without breaking detection. This separation is what makes the "no verified reason yet" state possible — it's not an error, it's a first-class outcome of the pipeline.

### Layer responsibilities

| Layer | Owns | Must not own |
|---|---|---|
| UI components/pages | Rendering, user interaction | SQL, API credentials |
| API client | HTTP calls, Firebase token attachment | UI state |
| Routes | Request validation | Business rules |
| Services | Market lookup, scoring, explanation policy | Express response objects |
| Repositories | Parameterized PostgreSQL access | Provider/network requests |
| Jobs | Periodic snapshots, evidence ingestion | Browser requests |

---

## Database Schema

```sql
users              -- firebase_uid, email, name, preferences (JSONB for flexible settings)
stocks             -- symbol, company_name, sector, industry, market_cap_category
watchlist_items    -- user_id, stock_id, added_at, removed_at (soft delete), last_seen_at
price_snapshots    -- stock_id, price, timestamp, source
events             -- GLOBAL, shared across all watchers: event_type, timestamp,
                   --   importance, status (DETECTED/VERIFIED), price_change_pct,
                   --   cached explanation
evidence           -- event_id, source, source_url, published_at, confidence
user_event_state   -- per-user relationship to a global event: seen_at, dismissed_at
event_explanations -- LLM answers cached by (event_id, normalized_question)
notifications      -- (schema in place; delivery not yet built — see below)
```

The two decisions I'd point to if asked to defend this schema: **soft-delete on `watchlist_items`** (so history survives removal), and **events being global while `user_event_state` is the only per-user row** (so the system doesn't duplicate the same market event thousands of times).

---

## How Each Feature Actually Works

**"While You Were Away"**
Queries all events across the user's active watchlist stocks with `timestamp > last_seen_at`, ranks them by attention score, and renders them as a timeline. Opening this screen updates `user_event_state.seen_at` immediately — so already-seen events don't reappear on the next visit, but new events after that point will.

**Attention Scoring**
```
score = 0.40 × abnormal_movement
      + 0.25 × event_importance
      + 0.20 × evidence_confidence
      + 0.15 × freshness (decays over time)
```
These weights are a judgment call I made, not a "correct" formula — I'm ready to defend them, not defend them as objectively true.

**Discover**
Two clearly separated sections: "Similar to your watchlist" (sector/industry similarity — e.g. TCS surfaces Infosys and HCLTech) and "Market exploration" (broader Indian-market stocks, explicitly not personalized). Neither section ever says "buy this" — only "explore this."

**Stock detail chart**
A real historical price series (not synthetic) rendered with a percentage scale, colored green for a rising trend and red/coral for falling — matching the direction of the move, not just a static color choice.

---

## Tech Stack — and Why

| Layer | Choice | Why not the alternative |
|---|---|---|
| Frontend | React + Vite + TypeScript | Faster iteration than Next.js for a product with no SEO requirement — this is an authenticated app, not a marketing site |
| Backend | Node.js + Express | Clear separation of frontend/backend responsibilities for a hackathon judge to follow |
| Database | PostgreSQL | Data is genuinely relational; MongoDB would mean rebuilding joins in app code for no real benefit |
| Cache | Redis | Prevents hammering the market API when many users watch the same stock; explicitly never authoritative |
| Auth | Firebase Auth | Don't reinvent password hashing, reset flows, or OAuth — spend hackathon time on the actual product problem |
| Market data | Yahoo Finance via a single adapter | Free, and isolated behind one file so switching providers later is a one-file change |
| Evidence | GNews | Free tier, returns dated articles I can attach as evidence with a timestamp and source |
| Explanation LLM | Groq (Llama 3.3) | Fast and free-tier friendly — acceptable since it's only ever called on-demand, not per request |

---

## What I Deliberately Didn't Build (Yet)

These aren't oversights — they're things I can justify holding off on, and I'd rather say that out loud than pretend the project is more finished than it is:

- **Notification system** (in-app/push tiers triggered by attention score) — the schema (`notifications` table) exists, delivery logic doesn't yet.
- **Scheduled 30-day purge** of soft-deleted watchlist relationships — currently soft-deleted forever, not yet garbage-collected.
- **Rate limiting** on the API itself and on Groq follow-up questions — needed before this could handle real public traffic.
- **Elasticsearch, Kafka, microservices** — none of these are justified at this data/traffic scale. I'd introduce Elasticsearch only if the security universe grew large enough to need fuzzy/typo-tolerant search, and Kafka only if event ingestion volume required durable async processing — neither of which is true for a hackathon-sized dataset.

---

## How to Run This

```bash
npm install
npm run dev
```

Open the address Vite prints (usually `http://localhost:5173`). Out of the box this runs in a safe demo mode with local evidence data — no keys required to explore the UI.

### Enable full functionality (persistence, real market data, Firebase auth)

1. Copy `.env.example` to `.env`. Add a free PostgreSQL `DATABASE_URL` (Neon or Supabase both offer free tiers), an optional `REDIS_URL`, and your Firebase project's values.
2. Run `npm run db:migrate` once to create the schema.
3. In Firebase Console, enable **Authentication** (Google or Email/Password). Add the web app's `VITE_FIREBASE_*` values, and a minified service-account JSON as `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Run `npm run api` and `npm run dev` in two separate terminals.

The app now opens on a **login screen** — the browser sends Firebase's ID token, and the API verifies it server-side. No one sees a populated dashboard without signing in.

### Enable evidence ingestion (GNews)

1. Get a free key at [gnews.io](https://gnews.io) and **verify the activation email** — the API returns `403` until confirmed.
2. Add `GNEWS_API_KEY` to `.env`.
3. Add TWELVE_DATA api to `TWELVE_DATA_API_KEY`

### Enable "Explain more" (Groq)

1. Get a free key at [console.groq.com/keys](https://console.groq.com/keys).
2. Add `GROQ_API_KEY` to `.env`, restart `npm run api`.

Without a key, "Explain more" shows a safe local fallback message instead of failing.

---

## Demo Walkthrough

1. **Login screen** — this is a real authenticated product, not a public dashboard.
2. **Watchlist** — subtle attention labels, no shouting banners.
3. **Click a stock** — a real historical chart with a percentage scale, colored to match the trend direction.
4. **While you were away** — show one event with real, sourced evidence, and one that explicitly says "no verified reason yet."
5. **Explain more** — click it on the verified event to show the on-demand, cached Groq tier.
6. **Discover** — show the two clearly separated sections: similarity-based vs. general exploration.
7. **`market-data.mjs` + this README's architecture section** — point out that swapping the provider touches one file, nothing else.

---

## Anticipated Questions 

**Why no microservices?** No independent scaling requirement exists yet — the modules already have clean boundaries, so splitting them later is a refactor, not a rewrite.

**Why cache with Redis at all?** Quote and search requests are shared across many users watching the same stocks; caching avoids re-hitting a rate-limited external API for data that hasn't changed in the last few seconds. It's never treated as authoritative.

**How does this scale to many users?** Events, evidence, and explanations are global rows, computed once and read by everyone watching that stock. Per-user state is intentionally thin — just a relationship row, not a duplicated copy of shared data.

**How do you actually prevent hallucination?** Structurally, not just by prompting carefully: an event with no verified evidence is never allowed to reach the LLM at all. The LLM only ever sees evidence that's already been saved and verified — it rephrases, it doesn't originate facts.

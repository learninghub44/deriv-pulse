# Deriv Pulse · AI Intelligence Terminal

> **Proprietary Software — All Rights Reserved**
> Unauthorized copying, distribution, or modification of this software is strictly prohibited.

---

Deriv Pulse is an institutional-grade, real-time digit analytics terminal for Deriv synthetic indices, forex, and cryptocurrency markets. It streams live tick data directly from the Deriv API and runs statistical pattern analysis, AI-powered signal generation, and audio-triggered alerts — all in the browser.

---

## Features

### Live Tick Analytics
- Real-time WebSocket feed from Deriv API (`wss://ws.derivws.com`)
- Configurable analysis window: 50 / 100 / 250 / 500 / 1000 ticks
- Supports Volatility (1s + 2s), Boom/Crash, Jump, Step, Range Break, Forex, and Crypto markets

### Pattern Panels
| Panel | What it shows |
|-------|--------------|
| Price Chart | SVG tick chart with fill gradient and live price dot |
| Market Statistics | High, Low, Range, Mean, Volatility σ, Up/Down counts |
| Digit Frequency | Bar chart of last-digit distribution vs expected 10% |
| Even / Odd | Split %, deviation, current streak |
| Rise / Fall | Tick direction split, momentum bias, flat count |
| Over / Under | Configurable barrier (1–9), over/under/equal pct |
| Matches / Differs | Configurable digit, match rate vs expected 10% |
| Volatility Regime | Rolling σ, recent vs older half comparison, EXPANDING/STABLE/COMPRESSING |
| Tick Stream | Last-digit grid, colored by rise/fall/last |
| Tick Log | Last 12 ticks with timestamp, quote, delta, last digit |

### Pattern Alerts (Audio Alarm Engine)
Monitors every new tick and fires alarms when patterns are detected:

| Pattern | Trigger | Level |
|---------|---------|-------|
| Digit hot bias | Any digit >20% above expected 10% | WARNING / CRITICAL |
| Digit cold bias | Any digit significantly below 10% | INFO |
| Even/Odd bias | Even or Odd skews past 65% | WARNING / CRITICAL |
| Even/Odd streak | 8+ consecutive same parity | WARNING / CRITICAL |
| Rise/Fall streak | 8+ consecutive same direction | WARNING / CRITICAL |
| Volatility spike | Avg tick move exceeds 2.5 pips | INFO / CRITICAL |

**Audio alarm sounds:**
- 🔴 CRITICAL — triple descending square-wave alarm
- 🟡 WARNING — double mid-tone triangle ping
- 🔵 INFO — single soft sine chime

All thresholds are configurable via the in-panel config drawer. 30-second dedupe window prevents alarm spam.

### AI Signal Assistant
Powered by **Groq · llama-3.3-70b-versatile**. Builds a full market snapshot (digit frequency, even/odd %, streaks, rise/fall, avg pips) and returns:

- **Sentiment** — BULLISH / BEARISH / NEUTRAL with confidence bar
- **Top Insight** — single most actionable pattern observation
- **Suggested Contracts** — Deriv contract types (Rise/Fall, Even/Odd, Matches/Differs, etc.)
- **Risk Note** — one-sentence caveat
- Auto-analyze toggle and last-analyzed timestamp

Requires `VITE_GROQ_API_KEY` in your `.env`.

### Trade Journal (Auth Required)
Log trades with symbol, contract type, stake, outcome, and notes. Persisted to Supabase with RLS — only visible to the authenticated user.

### Watchlists (Auth Required)
Save favourite symbols for quick switching.

---

## Tech Stack

- **React 19** + **TanStack Start** (SSR/SSG)
- **TanStack Router** (file-based routing)
- **Vite 8** + **Tailwind CSS v4**
- **Supabase** (PostgreSQL, Auth, RLS)
- **Groq API** (AI signals)
- **Space Grotesk** + **JetBrains Mono** (typography)

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/learninghub44/deriv-pulse.git
cd deriv-pulse

# 2. Install
npm install

# 3. Environment
cp .env.example .env
# Edit .env with your Supabase + Groq keys

# 4. Database
# Run supabase/migration.sql in your Supabase SQL Editor

# 5. Dev
npm run dev
# → http://localhost:3000
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment instructions (Cloudflare Pages / Render).

---

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GROQ_API_KEY=gsk_your_key   # optional — enables AI Signal panel
```

---

## Project Structure

```
src/
  components/
    ai/           AISignalPanel.tsx
    alerts/       AlertsPanel.tsx
    auth/         AuthModal.tsx
    journal/      TradeJournalPanel.tsx
    ui/           shadcn/ui primitives
  hooks/
    use-alerts.ts         Pattern alert engine + audio alarms
    use-ai-signal.ts      Groq AI signal hook
    use-auth.ts           Supabase auth
    use-deriv-ticks.ts    WebSocket tick stream
    use-trade-journal.ts  Journal CRUD
    use-watchlists.ts     Watchlist CRUD
  lib/
    database.types.ts     Supabase generated types
  routes/
    __root.tsx    Root layout + font injection
    index.tsx     Main terminal page
  styles.css      Design tokens + Tailwind config
supabase/
  migration.sql   Full DB schema
```

---

## Disclaimer

This terminal provides statistical analysis of live and historical tick data streamed from the Deriv API. Past distributions are not predictions of future ticks. Nothing in this application constitutes financial advice or a guarantee of profit. Synthetic index tick patterns are determined by certified random number generators. Trade responsibly.

---

*© 2024–2025 Deriv Pulse. Proprietary Software. All Rights Reserved.
Unauthorized copying, redistribution, or modification is strictly prohibited.*

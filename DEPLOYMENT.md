# Deriv Pulse — Deployment Guide

> Proprietary software. All rights reserved.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | TanStack Start (React 19 + Vite 8) |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| AI Signals | Groq API (llama-3.3-70b-versatile) |
| Hosting | Cloudflare Pages (recommended) or Render |

---

## 1. Prerequisites

- Node.js 20+ or Bun 1.1+
- A Supabase project
- A Groq API key (free at console.groq.com)
- GitHub account with repo access

---

## 2. Environment Variables

Create a `.env` file in the project root (never commit this file):

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Groq AI (for AI Signal panel)
VITE_GROQ_API_KEY=gsk_your_groq_key_here
```

All variables must be prefixed with `VITE_` — Vite only exposes them to the browser if they are.

---

## 3. Database Setup

Run the migration in your Supabase SQL Editor:

1. Go to **Supabase Dashboard → SQL Editor**
2. Open `supabase/migration.sql`
3. Paste the full contents and click **Run**

This creates:
- `profiles` table (auto-populated on signup via trigger)
- `trade_journal` table with RLS policies
- `watchlists` table with RLS policies
- All required enums and triggers

---

## 4. Local Development

```bash
# Install dependencies
npm install
# or
bun install

# Start dev server
npm run dev
# or
bun run dev
```

Dev server runs at `http://localhost:3000`

---

## 5. Deploying to Cloudflare Pages (Recommended)

Cloudflare Pages runs the TanStack Start server-side handler natively via Workers.

### Step 1 — Connect repo

1. Go to **Cloudflare Dashboard → Workers & Pages → Create**
2. Select **Pages → Connect to Git**
3. Choose the `learninghub44/deriv-pulse` repository

### Step 2 — Build settings

| Setting | Value |
|---------|-------|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `.output/public` |
| Node.js version | `20` |

### Step 3 — Environment variables

In **Settings → Environment variables**, add:

```
VITE_SUPABASE_URL        = https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY   = your-anon-key
VITE_GROQ_API_KEY        = gsk_your_groq_key
```

Set these for both **Production** and **Preview** environments.

### Step 4 — Deploy

Click **Save and Deploy**. Cloudflare builds and deploys automatically on every push to `main`.

---

## 6. Deploying to Render

### Step 1 — New Web Service

1. Go to **Render Dashboard → New → Web Service**
2. Connect the `learninghub44/deriv-pulse` repo

### Step 2 — Build & start settings

| Setting | Value |
|---------|-------|
| Runtime | Node |
| Build command | `npm install && npm run build` |
| Start command | `node .output/server/index.mjs` |

### Step 3 — Environment variables

Add in **Environment → Environment Variables**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GROQ_API_KEY
```

### Step 4 — Deploy

Click **Create Web Service**. Render deploys on every push to `main`.

---

## 7. Supabase Auth Configuration

After deployment, update your Supabase redirect URLs:

1. Go to **Supabase Dashboard → Authentication → URL Configuration**
2. Set **Site URL** to your deployed domain (e.g. `https://deriv-pulse.pages.dev`)
3. Add to **Redirect URLs**:
   - `https://deriv-pulse.pages.dev/**`
   - `http://localhost:3000/**` (for local dev)

---

## 8. Build Output

```
npm run build
```

Output goes to `.output/`:
```
.output/
  public/          ← static assets (CSS, JS, fonts)
  server/          ← server-side handler
    index.mjs
```

---

## 9. Verify Deployment

After deploying, check these work:

- [ ] Homepage loads with live tick stream
- [ ] Symbol sidebar lists all markets
- [ ] Alerts panel shows "Monitoring…" and fires on patterns
- [ ] Sign In opens auth modal
- [ ] AI Signal panel shows key warning if `VITE_GROQ_API_KEY` is not set
- [ ] Status bar shows feed status and tick rate

---

## 10. Troubleshooting

**Build fails with module errors**
```bash
rm -rf node_modules .output
npm install
npm run build
```

**Auth redirects not working**
Check your Supabase redirect URLs include the deployed domain.

**AI Signal returns error**
Confirm `VITE_GROQ_API_KEY` is set in environment variables and starts with `gsk_`.

**Ticks not streaming**
The Deriv WebSocket API (`wss://ws.derivws.com/websockets/v3`) must be reachable from the client. This is a browser-side connection — no server config needed.

---

*© 2024–2025 Deriv Pulse. Proprietary Software. All Rights Reserved.*

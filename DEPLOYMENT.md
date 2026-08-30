# CryptoChess - Deployment Guide

Complete step-by-step guide to deploy CryptoChess to production using **free tiers** (Vercel + Render + Supabase + UptimeRobot).

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Vercel         │────▶│   Render         │────▶│  Supabase    │
│   (Next.js)      │     │   (Express +     │     │  (PostgreSQL)│
│   Frontend       │◀────│    Socket.io)    │◀────│              │
└─────────────────┘     └─────────────────┘     └──────────────┘
                              │
                              ▼
                        ┌─────────────┐
                        │ UptimeRobot  │
                        │ (Free ping)  │
                        └─────────────┘
```

---

## Step 1: Database Setup (Supabase)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project (choose a region close to your users)
3. Go to **SQL Editor** and run the entire contents of `backend/src/db/schema.sql`
4. Copy your **Connection String** from Settings → Database:
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

---

## Step 2: Backend Deployment (Render)

1. Push your code to GitHub
2. Create a free account at [render.com](https://render.com)
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name:** `cryptochess-api`
   - **Runtime:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node src/server.js`
   - **Instance Type:** Free

6. Add **Environment Variables:**

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-app.vercel.app

# Database
DATABASE_URL=your-supabase-connection-string

# Auth
JWT_SECRET=generate-a-random-32-char-string

# ChangeNOW (optional — for auto-sweep to XMR)
CHANGENOW_API_KEY=your-api-key
OPERATOR_XMR_ADDRESS=your-monero-wallet
SWEEP_THRESHOLD_USDC=50

# Solana Pay (REQUIRED for stake payments)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PLATFORM_WALLET_ADDRESS=your-solana-wallet-public-key
```

7. Click **Deploy** — Render will install dependencies and start the server

### Generating a JWT_SECRET

```bash
# Run in your terminal:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Generating a Solana Platform Wallet

The `PLATFORM_WALLET_ADDRESS` is the **public key** of the wallet that receives all USDC stakes from players. You can:

1. **Use an existing Phantom wallet:** Copy your public key from Phantom
2. **Generate a new keypair for the platform:**

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.4/install)"

# Generate new keypair
solana-keygen new --outfile platform-wallet.json

# Get the public key
solana-keygen pubkey platform-wallet.json
# → This is your PLATFORM_WALLET_ADDRESS

# IMPORTANT: Keep platform-wallet.json secret! It's your platform's main wallet.
```

---

## Step 3: Frontend Deployment (Vercel)

1. Install Vercel CLI: `npm i -g vercel`
2. From the project root:

```bash
cd frontend
vercel
```

3. Follow the prompts, or configure via Vercel Dashboard:
   - **Framework:** Next.js (auto-detected)
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output:** `.next`

4. Add **Environment Variables** in Vercel Dashboard → Settings → Environment Variables:

```env
NEXT_PUBLIC_BACKEND_URL=https://cryptochess-api.onrender.com
NEXT_PUBLIC_PLATFORM_WALLET=your-solana-wallet-public-key
NEXT_PUBLIC_SOLANA_RPC=https://api.mainnet-beta.solana.com
```

5. Deploy! Vercel auto-deploys on every push to `main`.

---

## Step 4: UptimeRobot (Prevent Render Free Tier Sleep)

Render's free tier spins down after 15 minutes of inactivity. UptimeRobot pings your server every 5 minutes to keep it alive.

1. Create a free account at [uptimerobot.com](https://uptimerobot.com)
2. Click **Add New Monitor**
3. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** CryptoChess API
   - **URL:** `https://cryptochess-api.onrender.com/ping`
   - **Monitoring Interval:** 5 minutes
4. Click **Create Monitor**

The `/ping` endpoint returns `pong` with HTTP 200 — lightweight and fast.

---

## Step 5: Optional — ChangeNOW Auto-Sweep

When commission pool reaches 50 USDC, the system automatically swaps USDC → XMR via ChangeNOW and sends to your Monero wallet for privacy.

1. Create an account at [changenow.io/api](https://changenow.io/api)
2. Get your API key
3. Set `CHANGENOW_API_KEY` in your Render environment variables
4. Set `OPERATOR_XMR_ADDRESS` to your Monero wallet address
5. The sweep monitor runs automatically when the server starts

**Manual sweep trigger:**
```bash
curl -X POST https://your-api.onrender.com/api/admin/sweep
```

---

## Step 6: Testing the Full Flow

1. Open your Vercel URL (e.g., `https://your-app.vercel.app`)
2. Register a new account (you'll receive 100 USDC demo balance)
3. **Language:** Click the 🌐 EN/ES toggle to switch languages
4. Go to **Lobby → Quick Match** and select a stake
5. Open a second browser/incognito window, register another account
6. Select the same stake — both players will be matched
7. Play the game! The stake is automatically settled on completion

### Solana Pay Flow (Production)

When `NEXT_PUBLIC_PLATFORM_WALLET` is configured:
1. After matchmaking finds a match, the **Payment Lock Screen** appears
2. Player has **1 minute** to connect Phantom wallet and send USDC
3. Transaction is verified on-chain via the backend
4. If payment confirms in time → game starts
5. If timer expires → player returns to lobby

---

## Environment Variables Summary

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | ✅ | Backend API URL |
| `NEXT_PUBLIC_PLATFORM_WALLET` | ⚠️ | Solana wallet for USDC stakes (required for Solana Pay) |
| `NEXT_PUBLIC_SOLANA_RPC` | ⚠️ | Solana RPC endpoint (defaults to public mainnet) |

### Backend (Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Random 32+ char secret for JWT signing |
| `FRONTEND_URL` | ✅ | Vercel URL for CORS |
| `PLATFORM_WALLET_ADDRESS` | ⚠️ | Same as frontend's `NEXT_PUBLIC_PLATFORM_WALLET` |
| `SOLANA_RPC_URL` | ⚠️ | Same as frontend's Solana RPC |
| `CHANGENOW_API_KEY` | ❌ | For auto-sweep feature |
| `OPERATOR_XMR_ADDRESS` | ❌ | Monero address for swept funds |
| `SWEEP_THRESHOLD_USDC` | ❌ | Default: 50 |

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Vercel (Frontend) | Hobby | **$0/mo** |
| Render (Backend) | Free | **$0/mo** |
| Supabase (Database) | Free | **$0/mo** |
| UptimeRobot | Free | **$0/mo** |
| **Total** | | **$0/mo** |

---

## Production Checklist

- [ ] Generate strong `JWT_SECRET` (32+ random characters)
- [ ] Set `PLATFORM_WALLET_ADDRESS` to your actual Solana wallet
- [ ] Verify database schema is applied in Supabase
- [ ] Test registration, login, and game flow
- [ ] Test Solana Pay with a small amount (1 USDC)
- [ ] Set up UptimeRobot monitor
- [ ] (Optional) Configure ChangeNOW API key for auto-sweep
- [ ] (Optional) Set up custom domain on Vercel
- [ ] (Optional) Upgrade to paid Render plan for better performance

---

## Local Development

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
npm install
npm run db:init   # Creates tables
npm run dev       # Starts on :3001

# Frontend
cd frontend
cp .env.example .env.local
# Edit .env.local:
# NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
# NEXT_PUBLIC_PLATFORM_WALLET=your-wallet-or-empty
npm install
npm run dev       # Starts on :3000
```

---

## Supported Languages

- 🇺🇸 **English** (default)
- 🇪🇸 **Español**

Toggle via the globe icon (🌐) in the top-right of every page. Language preference is saved to localStorage.

---

## Motivational Phrases

The platform displays rotating motivational/hype phrases throughout the UI:
- Landing page
- Lobby (while selecting stake)
- Waiting for match
- During gameplay (below the chessboard)

All phrases are localized in EN/ES. See `frontend/lib/i18n/en.ts` and `frontend/lib/i18n/es.ts` for the full list.

# ♚ CryptoChess

**Play Chess. Win Crypto.**

A full-stack crypto chess platform with real-time PvP, internal custody system, and Solana Pay integration. Built with Next.js, Express, Socket.io, chess.js, and PostgreSQL.

![Stack](https://img.shields.io/badge/Next.js-black?style=flat&logo=next.js) ![Stack](https://img.shields.io/badge/Express-black?style=flat) ![Stack](https://img.shields.io/badge/Socket.io-black?style=flat&logo=socket.io) ![Stack](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql) ![Stack](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss) ![Stack](https://img.shields.io/badge/Solana-9945FF?style=flat&logo=solana)

---

## ✨ Features

- **⚡ Quick Match** — Auto-matchmaking by stake amount (1, 5, 10, 50, 100 USDC)
- **👥 Challenge Friend** — Generate a 6-character code, share the link, play in real-time
- **♟ Real-time PvP** — Server-validated chess moves via WebSocket (chess.js)
- **💰 Internal Custody** — Server-managed escrow, no smart contracts, zero gas fees
- **🔐 Solana Pay** — Pay stakes via Phantom wallet with 1-minute lock screen
- **🌐 Multi-language** — Full EN/ES support with globe toggle
- **🔥 Motivational Phrases** — Rotating hype phrases to keep players fired up
- **💱 Auto-Sweep** — Commission pool auto-converts to Monero (XMR) via ChangeNOW at 50 USDC
- **📊 Stats & History** — Win rate, earnings, game history, transaction log
- **🎨 Dark Crypto UI** — Premium dark theme with gold/green neon accents

## 📁 Project Structure

```
cryptochess/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql       # PostgreSQL schema
│   │   │   ├── connection.js    # Connection pool
│   │   │   └── init.js          # DB initializer
│   │   ├── middleware/
│   │   │   └── auth.js          # JWT auth middleware
│   │   ├── routes/
│   │   │   ├── auth.js          # Register/Login/Profile
│   │   │   ├── wallet.js        # Balance/Deposits/Transactions
│   │   │   ├── games.js         # Challenges/Game history
│   │   │   └── solana.js        # Solana Pay verification
│   │   ├── services/
│   │   │   ├── escrow.js        # Balance lock/settle logic
│   │   │   ├── matchmaking.js   # In-memory queue
│   │   │   └── changenow.js     # USDC→XMR auto-sweep
│   │   └── server.js            # Express + Socket.io server
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Landing/Auth/Dashboard
│   │   ├── lobby/page.tsx       # Matchmaking + Challenge UI
│   │   ├── play/[gameId]/       # Chessboard + real-time game
│   │   ├── profile/page.tsx     # Wallet, History, Stats
│   │   ├── providers.tsx        # Auth + i18n providers
│   │   ├── layout.tsx           # Root layout
│   │   └── globals.css          # Dark theme styles
│   ├── components/
│   │   ├── PaymentLockScreen    # Solana Pay 1-min countdown
│   │   ├── LanguageSwitcher     # EN/ES toggle
│   │   └── HypePhrases          # Motivational quotes
│   ├── lib/
│   │   ├── api.ts               # HTTP client
│   │   ├── auth-context.tsx     # Auth state
│   │   ├── socket.ts            # Socket.io client
│   │   ├── solana-pay.ts        # Phantom wallet integration
│   │   └── i18n/                # Translations (EN/ES)
│   ├── .env.example
│   └── package.json
├── DEPLOYMENT.md                # Full deployment guide
└── README.md
```

## 🚀 Quick Start

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
npm install
npm run db:init    # Create tables
npm run dev        # http://localhost:3001
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
npm install
npm run dev        # http://localhost:3000
```

## 🌐 Multi-language (EN/ES)

- Toggle via 🌐 button in the top-right corner
- All UI text is translated (auth, lobby, game, profile, modals)
- 24 motivational hype phrases in each language
- Language preference saved to localStorage

## 💳 Solana Pay Flow

When `NEXT_PUBLIC_PLATFORM_WALLET` is set:

1. Player matches → **Payment Lock Screen** appears
2. Player connects **Phantom wallet** and sends USDC stake
3. **1-minute countdown** — must complete payment in time
4. Transaction verified on-chain → game starts
5. If expired → player returns to lobby

If `PLATFORM_WALLET` is not set, the system uses internal balance only.

## 🏗 Architecture

- **Zero blockchain contracts** — all custody managed server-side
- **ACID transactions** for all balance operations
- **Server-side move validation** via chess.js (no client trust)
- **In-memory matchmaking queue** for instant pairing
- **Real-time WebSocket** gameplay with Socket.io
- **Commission auto-sweep** to Monero via ChangeNOW

## 📖 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full guide:

- **Frontend:** Vercel (free)
- **Backend:** Render (free)
- **Database:** Supabase PostgreSQL (free)
- **Uptime:** UptimeRobot (free)
- **Total cost: $0/month**

## License

MIT

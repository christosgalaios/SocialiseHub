# SocialiseHub

A unified event management hub for the Socialise events company. SocialiseHub provides a single dashboard to create, publish, and sync events across multiple platforms — with encrypted OAuth credentials, AI-assisted event generation, and a built-in market analyzer.

---

## Features

- **Unified Dashboard** — View and manage all events from one place, with per-platform publish status
- **Multi-Platform Publishing** — Publish events to Meetup, Eventbrite, and Headfirst Bristol simultaneously
- **OAuth Flows** — Secure OAuth 2.0 connections to Meetup and Eventbrite with encrypted token storage
- **Platform Sync** — Pull external event listings into the local database and track sync history
- **Encrypted Credentials** — OAuth tokens stored encrypted at rest using AES-256-GCM
- **Event Generator** — AI-assisted event idea generation using market analysis of competitor listings
- **Market Analyzer** — Scrapes public event listings from connected platforms for Bristol-area insights

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20 |
| **Language** | TypeScript |
| **Database** | SQLite via better-sqlite3 |
| **Backend** | Express 5 |
| **Frontend** | React 19, Vite 7, React Router v7 |
| **Testing** | Vitest (80% coverage target) |
| **CI/CD** | GitHub Actions |

---

## Architecture

```
src/
  data/        # SQLite database, stores (events, services, sync), encryption, migration
  tools/       # Platform API clients (Meetup, Eventbrite, Headfirst), PublishService
  routes/      # Express API routes: /events, /services, /auth, /sync, /generator
  agents/      # MarketAnalyzer for competitor event scraping
  lib/         # Shared utilities (validation)
  shared/      # TypeScript types shared across server and client

client/src/
  pages/       # React pages (Dashboard, Events, Services, Generator, AppTester)
  components/  # Reusable UI components
  api/         # API client for backend calls
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- OAuth app credentials for any platforms you want to connect (Meetup, Eventbrite)

### Setup

```bash
# Install dependencies
npm install

# Run the dev server (Express + Vite)
npm run dev:web

# Run tests
npm run test:run

# Build everything
npm run build:all
```

### Environment Variables

Set these in your shell environment — do not edit `.env` files directly.

| Variable | Description |
|---|---|
| `MEETUP_CLIENT_ID` | Meetup OAuth app client ID |
| `MEETUP_CLIENT_SECRET` | Meetup OAuth app client secret |
| `EVENTBRITE_CLIENT_ID` | Eventbrite OAuth app client ID |
| `EVENTBRITE_CLIENT_SECRET` | Eventbrite OAuth app client secret |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM token encryption |
| `PORT` | Server port (default: 3000) |

---

## Running in Web Mode

SocialiseHub is designed to run as a web app that can be loaded in Chrome. The Chrome extension connects to the local Express server.

```bash
# Start both Express API and Vite dev server
npm run dev:web
```

The app will be available at `http://localhost:5173` (Vite) and the API at `http://localhost:3000`.

---

## Database

Events and service connections are stored in a local SQLite database at `data/socialise.db`. The schema is created automatically on first run.

To migrate data from old JSON store files (`data/events.json`, `data/services.json`):

```bash
npx tsx src/data/migrate-json.ts
```

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Active development — PRs target here |
| `production` | Stable releases |

---

## License

This project is private and not licensed for public use.

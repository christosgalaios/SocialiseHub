# SocialiseHub

AI-powered business operations tool for the Socialise events company.

## Stack

- **Runtime:** Node.js 20, TypeScript
- **Desktop:** Electron 40 (BaseWindow + WebContentsView)
- **Database:** SQLite (better-sqlite3) — local file at `data/socialise.db`
- **Frontend:** React 19, Vite 7, React Router v7
- **Backend:** Express 5 (runs inside Electron)
- **Testing:** Vitest
- **CI:** GitHub Actions (auto-approve, deploy)
- **Platforms:** Meetup, Eventbrite, Headfirst Bristol

## Architecture

```
electron/main.ts          — Electron main process, window management, IPC, automation view
electron/preload.ts       — Preload script (MUST compile as CommonJS, separate tsconfig)
src/data/                 — SQLite database, stores, migrations
src/automation/           — Browser automation engine, platform scripts, bridge, clients
src/tools/                — PublishService, PlatformClient interface
src/routes/               — Express API routes (events, services, sync, generator)
client/src/               — React frontend (pages, components, API client)
```

### Browser Automation (not API/OAuth)

Platform integrations use **browser automation via Electron WebContentsView**, not OAuth/API keys. The automation view shows the actual platform website and drives it like a real user.

- `src/automation/engine.ts` — Step-based engine (navigate, click, fill, evaluate, etc.)
- `src/automation/bridge.ts` — HTTP bridge (localhost:39847) for Express ↔ Electron IPC
- `src/automation/{meetup,eventbrite,headfirst}.ts` — Platform-specific step scripts
- `src/automation/{meetup,eventbrite,headfirst}-client.ts` — PlatformClient implementations via bridge

### Electron Layout

- **Left panel:** SocialiseHub React app (appView)
- **Right panel:** Claude.ai chat (claudeView) OR automation browser (automationView)
- Automation view uses `session.fromPartition('persist:automation')` for isolated cookies

### Build

Two Electron tsconfigs — main.ts compiles as ESM, preload.ts compiles as CommonJS:
- `electron/tsconfig.json` — ESM (excludes preload.ts)
- `electron/tsconfig.preload.json` — CommonJS (preload.ts only)

Native modules (better-sqlite3) must be rebuilt for Electron with `@electron/rebuild`. The bat file handles this automatically.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
- Never edit .env files — set environment variables manually
- API keys go in environment variables, never in code
- Test platform integrations with mocks
- Sequential automation — one platform at a time (single WebContentsView)

## Running

```bash
SocialiseHub.bat           # Launch desktop app (auto-installs, builds, rebuilds native modules)
npm run dev                # Dev mode (Electron + Vite HMR)
npm run dev:web            # Web-only dev (no Electron)
npm run test:run           # Run tests once
npm run build:all          # Build server + electron + client
```

## Key Implementation Details

- Meetup connect stores `groupUrlname` in service extra data — used by sync/publish/scrape
- Service connection status stored in SQLite `services` table
- Sync pull calls `client.fetchEvents()` which uses automation bridge → Electron → browser scrape
- Meetup publish supports `draft: true` in data to save as draft instead of going live

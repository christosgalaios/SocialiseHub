# SocialiseHub

AI-powered business operations tool for the Socialise events company.

## Stack

- **Runtime:** Node.js 20, TypeScript
- **Database:** SQLite (better-sqlite3) — local file at `data/socialise.db`
- **Frontend:** React 19, Vite 7, React Router v7
- **Backend:** Express 5
- **Testing:** Vitest (80% coverage target)
- **CI:** GitHub Actions (auto-approve, deploy)
- **Platforms:** Meetup (GraphQL), Eventbrite (REST v3), Headfirst Bristol (web scraping)

## Architecture

- `src/data/` — SQLite database, stores, encryption, migration
- `src/tools/` — Platform clients (MeetupClient, EventbriteClient, HeadfirstClient), PublishService
- `src/routes/` — Express API routes (events, services, auth, sync, generator)
- `client/src/` — React frontend (pages, components, API client)

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
- Never edit .env files — set environment variables manually
- API keys go in environment variables, never in code
- Test platform integrations with mocks
- OAuth tokens encrypted at rest with AES-256-GCM
- All platform API calls server-side only

## Environment Variables

- `MEETUP_CLIENT_ID` / `MEETUP_CLIENT_SECRET` — Meetup OAuth
- `EVENTBRITE_CLIENT_ID` / `EVENTBRITE_CLIENT_SECRET` — Eventbrite OAuth
- `PORT` — Server port (default 3000)

## Running

```bash
npm run dev:web    # Express + Vite dev servers
npm run test:run   # Run tests once
npm run build:all  # Build everything
```

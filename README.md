# Socialise Hub

AI-powered event management and business scaling tool for the Socialise events company.

---

## What is Socialise Hub?

Socialise Hub automates the operational side of running an events business. It uses AI to learn from past events, create and publish new events across multiple platforms simultaneously, and (eventually) manage social media presence.

### Core Features (Planned)

- **Event Analysis** — Analyse past event data to identify what works: timing, pricing, venues, categories, audience demographics
- **Event Creation** — Input event details once, select images from the library, and publish to Meetup, Headfirst Bristol, and other platforms simultaneously
- **Business Scaling** — AI recommendations based on historical patterns: optimal event frequency, pricing strategies, marketing approaches
- **Social Media Management** — (Future) Automated posting, scheduling, and engagement tracking

---

## Tech Stack

| Layer | Tech |
|---|---|
| **Runtime** | Node.js 20 |
| **Language** | TypeScript (planned) |
| **Testing** | Vitest |
| **CI/CD** | GitHub Actions |
| **Platforms** | Meetup API, Headfirst Bristol, more TBD |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Platform API keys (Meetup, etc.)

### Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your API keys

# Run tests
npm test

# Build
npm run build
```

### Environment Variables

| Variable | Description |
|---|---|
| `MEETUP_API_KEY` | Meetup API key for event publishing |
| `ANTHROPIC_API_KEY` | Anthropic API key (for CI bug-fixer agent) |

---

## Project Structure

```
/src
  /agents          # AI agent modules (analysis, creation, social)
  /tools           # Platform API integrations
  /lib             # Shared utilities
  /data            # Data models and schemas

/scripts           # CLI scripts and automation
/.github/workflows # CI/CD pipelines
/.claude           # Claude Code automation config
```

---

## Development

### Branch Strategy

| Branch | Purpose |
|---|---|
| `development` | Integration branch — PRs target here |
| `production` | Stable releases |

**Workflow:**
1. Create feature branches from `development`
2. PRs are auto-validated (lint, test, build) and auto-merged
3. Merge `development` into `production` for releases

---

## License

This project is private and not licensed for public use.

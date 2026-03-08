# SocialiseHub — Claude Brain

> Fast-reference context for Claude Code. Read this file before touching anything.

---

## What This Tool Is

**SocialiseHub** is an AI-powered business operations tool for the Socialise events company. It automates event management, learns from past events to scale the business, and manages multi-platform publishing.

**Core capabilities (planned):**
1. **Event Analysis & Learning** — Analyses past event data (attendance, engagement, revenue, feedback) to identify patterns and recommend improvements
2. **Event Creation Mode** — Takes event details as input, accesses an image library, and publishes events across Meetup, Headfirst Bristol, and other platforms simultaneously
3. **Social Media Management** — (Future) Automates posting, scheduling, and engagement across social channels

**Current state:** Early development. Project scaffolding and CI/CD workflows in place.

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript (planned) |
| Testing | Vitest |
| CI/CD | GitHub Actions (auto-approve, bug-fixer, dependabot, deploy) |
| Platforms | Meetup API, Headfirst Bristol, others TBD |

---

## Platform & Environment

- **OS:** Windows 11 (development), Ubuntu (CI)
- **Shell:** Git Bash on Windows — use Unix paths and commands
- **Package manager:** npm
- **Node:** v20

---

## Project Structure (Planned)

```
/src
  /agents              # AI agent modules
    event-analyzer.ts  # Past event analysis and learning
    event-creator.ts   # Multi-platform event publishing
    social-manager.ts  # Social media management (future)
  /tools               # Platform integrations
    meetup.ts          # Meetup API client
    headfirst.ts       # Headfirst Bristol integration
  /lib                 # Shared utilities
  /data                # Data models and schemas
  /images              # Event image library (referenced, not committed)

/scripts               # CLI scripts and automation

/.github/workflows     # CI/CD: auto-approve, bug-fixer, deploy-dev, deploy-prod, dependabot
/.claude               # Claude Code automation config
  /agents              # Subagent definitions
  /skills              # Reusable workflow skills
  /hooks               # Pre/post tool hooks
```

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Default branch (initial) |
| `development` | Integration branch — PRs target here |
| `production` | Stable release — only receives merges from development |
| `claude/*` | Claude Code working branches |
| Feature branches | Short-lived, branch from development |

**Flow:** feature branch → PR to development (auto-validated + merged) → PR to production (deploy)

---

## Git Conventions

### Commit Messages
Use conventional commits:
- `feat:` — New feature or capability
- `fix:` — Bug fix
- `chore:` — Maintenance, CI, config changes
- `refactor:` — Code restructuring without behavior change
- `test:` — Adding or updating tests
- `docs:` — Documentation changes

### PR Rules
- Always rebase onto development before pushing: `git fetch origin development && git rebase origin/development && git push --force-with-lease`
- Never push directly to development or production
- CHANGELOG.md must be updated for code changes in `src/`, `agents/`, `tools/`, `lib/`, `scripts/`

---

## CI/CD Workflows

| Workflow | Trigger | What It Does |
|---|---|---|
| `auto-approve.yml` | PR opened/updated | Validates (lint, test, build, changelog), auto-merges |
| `bug-fixer.yml` | Issue labeled 'bug' | Claude Code agent auto-fixes reported bugs |
| `dependabot-auto-merge.yml` | Dependabot PR | Auto-merges minor/patch dependency updates |
| `deploy-development.yml` | Push to development | Tests + builds development |
| `deploy-production.yml` | Push to production | Tests + builds production, back-merges to development |

---

## Key Design Decisions

- **Multi-platform publishing:** Events are created once and published to all platforms via their APIs
- **Learning from data:** The tool analyses historical event data to recommend optimal timing, pricing, venue choices, and marketing strategies
- **Image management:** Event images are stored in a local/cloud folder and referenced by the event creation agent
- **Modular agents:** Each capability (analysis, creation, social) is a separate agent module that can be developed and tested independently

---

## Lessons & Conventions

1. Always rebase before pushing — never merge, always rebase onto development
2. Update CHANGELOG.md with every code change
3. Never edit .env files through Claude — set environment variables manually
4. Keep agent modules independent — avoid tight coupling between agents
5. All platform API keys go in environment variables, never in code
6. Test platform integrations with mocks — don't hit real APIs in tests

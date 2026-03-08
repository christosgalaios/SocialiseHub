# SocialiseHub

AI-powered business operations tool for the Socialise events company.

## Stack

- **Runtime:** Node.js 20, TypeScript
- **Testing:** Vitest
- **CI:** GitHub Actions (auto-approve, deploy)
- **Platforms:** Meetup API, Headfirst Bristol

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
- Never edit .env files — set environment variables manually
- API keys go in environment variables, never in code
- Test platform integrations with mocks

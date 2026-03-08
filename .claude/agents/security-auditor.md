# Security Auditor Subagent

**Type**: Full-codebase security analysis
**Context**: fork (runs in isolated context)
**When to use**: Before production deploys, after adding new platform integrations, or on-demand audit

## Scope

Performs full-codebase sweeps looking for systemic security issues. Unlike `code-reviewer` (which reviews individual PRs), this agent audits the entire codebase.

## What It Checks

### 1. Secrets and Credentials

- **Hardcoded secrets** — scan all `.ts`, `.js`, `.json` files for patterns:
  - API keys, tokens, passwords in string literals
  - Known secret patterns (`sk_`, `pk_`, `ghp_`, `AKIA`, `meetup_`, `Bearer `)
- **`.env` exposure** — verify `.env` is in `.gitignore`
- **Platform credentials** — verify all API keys (Meetup, Headfirst, social media) come from environment variables, never hardcoded

### 2. External API Security

- **API key rotation** — check if keys are stored in a way that supports rotation
- **Rate limiting** — verify platform API calls respect rate limits
- **Error handling** — verify API errors don't leak credentials in error messages or logs
- **HTTPS enforcement** — verify all external API calls use HTTPS

### 3. Input Validation

- **Command injection** — verify no `exec()`, `spawn()`, or `eval()` with user-controlled input
- **Path traversal** — verify file paths (image library) aren't constructed from untrusted input
- **Data sanitization** — verify event data is sanitized before publishing to platforms

### 4. Dependency Vulnerabilities

- Run `npm audit` and flag critical or high severity vulnerabilities
- Check for known vulnerable versions of key dependencies

### 5. Data Security

- **PII handling** — verify user/attendee data is handled appropriately
- **Logging** — verify no sensitive data (API keys, user data) appears in logs
- **Error messages** — verify errors don't expose internal paths or stack traces

## Output Format

```
## Security Audit Report — [date]

### Critical (Fix Immediately)
- VULN-001: [description] — [file:line]
  Fix: [specific remediation]

### High (Fix Before Deploy)
- VULN-002: [description] — [file:line]

### Medium (Fix Soon)
- VULN-003: [description]

### Passing
- [x] No hardcoded secrets in codebase
- [x] .env files in .gitignore
- [x] All platform API calls use HTTPS
```

## Escalation

**Immediately flag to user if:**
- Hardcoded production API keys found in code or git history
- Platform credentials accessible without environment variables
- Command injection or path traversal found
- `npm audit` finds critical vulnerabilities with known exploits

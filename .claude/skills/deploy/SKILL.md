---
name: deploy
description: Pre-deploy verification checklist and deployment trigger
disable-model-invocation: false
context: fork
---

# Deploy Checklist

Runs a pre-deploy verification checklist before merging to production.

## Usage

```
/deploy              # Run full pre-deploy checklist on current branch
/deploy production   # Verify + trigger production deploy
```

## Pre-Deploy Checklist

### Step 1 — Verify current branch state

```bash
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"
git status --porcelain
```

- Must be on `development` branch
- No uncommitted changes

### Step 2 — Run validation suite

```bash
npm run lint && npm test -- --run && npm run build
```

Report each result:
- Lint: PASS/FAIL
- Tests: PASS/FAIL (test count)
- Build: PASS/FAIL

If ANY check fails, stop and fix before proceeding.

### Step 3 — Verify CHANGELOG.md

```bash
head -30 CHANGELOG.md
```

If `[Unreleased]` is empty, warn — every deploy should have changelog entries.

### Step 4 — Check deployment readiness

```bash
git fetch origin development
git log --oneline origin/development..HEAD | head -5
```

### Step 5 — Deploy (if requested)

If the user said `/deploy production`:

1. Create a PR from `development` -> `production`:
   ```bash
   gh pr create --base production --head development --title "Deploy $(date +%Y-%m-%d)" --body "$(cat <<'EOF'
   ## Production Deploy

   All checks passed:
   - [x] Lint clean
   - [x] Tests passing
   - [x] Build successful
   - [x] CHANGELOG.md updated

   Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

2. If `gh` is unavailable, provide the manual URL:
   ```
   https://github.com/christosgalaios/socialise-hub/compare/production...development
   ```

## Notes

- Production deploys go through `development -> production` PR flow
- The `deploy-production.yml` workflow auto-deploys on merge
- Never push directly to production

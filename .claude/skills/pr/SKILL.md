---
name: pr
description: Create a pull request with rebase, push, and gh CLI fallback
disable-model-invocation: false
context: fork
---

# Create Pull Request

Rebases onto development, pushes the branch, and creates a PR — with automatic fallback if `gh` CLI is unavailable.

## Usage

```
/pr                    # Create PR from current branch -> development
/pr "Fix event parser" # Create PR with custom title
```

## Workflow

### Step 1 — Pre-flight checks

1. Verify you're on a feature branch (not `development` or `production`):
   ```bash
   BRANCH=$(git branch --show-current)
   if [ "$BRANCH" = "development" ] || [ "$BRANCH" = "production" ]; then
     echo "ERROR: Cannot create a PR from $BRANCH. Switch to a feature branch first."
     exit 1
   fi
   ```

2. Check for uncommitted changes:
   ```bash
   git status --porcelain
   ```
   If there are unstaged changes, ask the user if they want to commit first.

3. Verify CHANGELOG.md was updated (if code files changed):
   ```bash
   git diff development --name-only | grep -E '^(src/|agents/|tools/|lib/|scripts/)' && \
   git diff development -- CHANGELOG.md | head -5
   ```
   If source files changed but CHANGELOG.md didn't, auto-draft a changelog entry and present it for approval.

### Step 2 — Rebase and push

Always rebase onto development before pushing:

```bash
git fetch origin development && git rebase origin/development && git push --force-with-lease origin "$BRANCH"
```

If the rebase has conflicts, stop and help the user resolve them.

### Step 3 — Create the PR

1. Check if `gh` CLI is available:
   ```bash
   gh auth status 2>&1
   ```

2. **If `gh` is available:** Create the PR:
   ```bash
   gh pr create --base development --title "PR title" --body "$(cat <<'EOF'
   ## Summary
   - Change description

   ## Test plan
   - [ ] Lint passes
   - [ ] Tests pass
   - [ ] Build succeeds

   Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

3. **If `gh` is NOT available:** Provide the manual URL:
   ```
   Create your PR manually:
   https://github.com/christosgalaios/socialise-hub/compare/development...<branch-name>
   ```

### Step 4 — Report

Output the PR URL and a summary of what's in the PR.

## Notes

- Always targets `development` branch
- The auto-approve workflow will validate (lint + test + build) and merge if clean

---
name: release
description: Archive changelog, tag release, and create GitHub Release with notes
disable-model-invocation: true
context: fork
---

# Release Manager

Automates the release process: archives `[Unreleased]` changelog entries, tags the commit, and creates a GitHub Release with formatted notes.

## Usage

```
/release              # Release with auto-detected version from latest PR
/release 0.1.5        # Release with explicit version
```

## Workflow

### Step 1 — Determine version

1. If a version was provided as argument, use that.
2. Otherwise, detect from the latest merged PR number:
   ```bash
   gh pr list --state merged --base development --limit 1 --json number --jq '.[0].number' 2>/dev/null || \
   git log --oneline origin/development -1 | grep -oP '#\K\d+'
   ```
   Version format: `0.1.{PR#}`

3. Verify this version hasn't been released yet:
   ```bash
   git tag -l "v$VERSION"
   ```

### Step 2 — Validate pre-release state

1. Must be on `development` branch with clean working tree.
2. Verify `[Unreleased]` section has entries.
3. Run validation suite: `npm run lint && npm test -- --run && npm run build`

### Step 3 — Archive changelog

Replace `## [Unreleased]` with:
```markdown
## [Unreleased]

## [VERSION] — YYYY-MM-DD
```

Commit: `release: v$VERSION`

### Step 4 — Create GitHub Release

```bash
gh release create "v$VERSION" \
  --title "v$VERSION" \
  --notes "$RELEASE_NOTES" \
  --target development
```

If `gh` is unavailable, provide the manual URL:
```
https://github.com/christosgalaios/socialise-hub/releases/new?tag=v$VERSION&target=development
```

### Step 5 — Report

Output version, changelog entries, and GitHub Release URL.

## Notes

- This skill only manages release metadata — it does NOT deploy. Use `/deploy production` after releasing.
- Never create a release if `[Unreleased]` is empty.

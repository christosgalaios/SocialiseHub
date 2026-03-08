#!/bin/bash
# PreToolUse hook — warns if pushing code changes without CHANGELOG.md update
# Checks staged files for src/ or scripts/ changes without CHANGELOG.md
# Exit 0 = allow, Exit 2 = block with message

INPUT=$(cat)

# Extract the command from the tool input JSON
COMMAND=$(echo "$INPUT" | grep -o '"command":"[^"]*"' | head -1 | cut -d'"' -f4 2>/dev/null || echo "$INPUT")

# Only check on git push commands
if echo "$COMMAND" | grep -qE 'git\s+push' 2>/dev/null; then
  # Check if there are code changes in the branch compared to development
  CODE_CHANGES=$(git diff origin/development --name-only 2>/dev/null | grep -E '^(src/|agents/|tools/|lib/|scripts/)' | head -1)
  CHANGELOG_CHANGED=$(git diff origin/development --name-only 2>/dev/null | grep -q 'CHANGELOG.md' && echo "yes" || echo "no")

  if [ -n "$CODE_CHANGES" ] && [ "$CHANGELOG_CHANGED" = "no" ]; then
    echo "WARNING: You are pushing code changes without updating CHANGELOG.md."
    echo "Add an entry under [Unreleased] before pushing. This is mandatory per project conventions."
    echo ""
    echo "Changed files include: $CODE_CHANGES"
    exit 2
  fi
fi

exit 0

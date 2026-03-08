#!/bin/bash
# PreToolUse hook — blocks bare `git push` without prior rebase
# Reads the Bash command from stdin and checks for unsafe push patterns
# Exit 0 = allow, Exit 2 = block with message

INPUT=$(cat)

# Extract the command from the tool input JSON
COMMAND=$(echo "$INPUT" | grep -o '"command":"[^"]*"' | head -1 | cut -d'"' -f4 2>/dev/null || echo "$INPUT")

# Check if this is a git push command
if echo "$COMMAND" | grep -qE 'git\s+push' 2>/dev/null; then
  # Allow if the command chain includes rebase (rebase-then-push pattern)
  if echo "$COMMAND" | grep -qE 'rebase' 2>/dev/null; then
    exit 0
  fi

  # Allow if pushing to main tracking branch (not feature branches)
  if echo "$COMMAND" | grep -qE 'git\s+push\s+--force-with-lease' 2>/dev/null; then
    # force-with-lease after a separate rebase is fine
    exit 0
  fi

  # Block bare git push without rebase
  echo "BLOCKED: Always rebase before pushing."
  echo "Use: git fetch origin development && git rebase origin/development && git push --force-with-lease origin <branch>"
  exit 2
fi

exit 0

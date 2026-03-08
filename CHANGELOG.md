# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- GitHub Actions workflows (auto-approve, bug-fixer, dependabot auto-merge, deploy)
- Dependabot configuration for automated dependency updates
- Bug report issue template
- CLAUDE.md project brain with architecture, conventions, and stack reference
- README.md with project overview and getting started guide
- Claude Code automation suite: settings, hooks, agents, and skills
  - Hooks: auto-lint, block .env, rebase guard, changelog check
  - Agents: code-reviewer, security-auditor, test-coverage-analyzer, bug-fixer
  - Skills: /pr, /gen-test, /deploy, /release
- Node.js project scaffolding (package.json, TypeScript, ESLint, Vitest)
- Minimal `src/index.ts` entry point with version export
- Initial unit test for entry point
- `.gitignore` for node_modules, dist, env files

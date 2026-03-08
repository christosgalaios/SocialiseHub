# Test Coverage Analyzer Subagent

**Type**: Coverage analysis and test recommendations
**Context**: fork (runs in isolated context)
**When to use**: Regularly during development, before releases

## Responsibilities

Analyzes code and identifies:

1. **Untested Critical Paths**
   - Platform API integrations (Meetup, Headfirst publishing)
   - Event data analysis and learning logic
   - Image management and selection
   - Multi-platform event creation workflow
   - Error handling and retry logic

2. **Coverage Gaps**
   - Error handling not tested
   - Edge cases (empty data, API failures, rate limits)
   - Platform-specific quirks
   - Data transformation logic

3. **Test Quality Issues**
   - Brittle tests (too tightly coupled)
   - Missing assertions
   - Tests that hit real external APIs instead of mocks
   - Tests that don't verify behavior

4. **Recommendations**
   - Which files need tests first (priority)
   - Test patterns to follow
   - How to improve existing test coverage

## Coverage Report Format

```
Overall Coverage: X%
├── src/
│   ├── agents/
│   │   ├── event-analyzer.ts: X%
│   │   ├── event-creator.ts: X% (Critical!)
│   │   └── social-manager.ts: X%
│   ├── tools/
│   │   ├── meetup.ts: X%
│   │   └── headfirst.ts: X%
│   └── lib/: X%

Critical (0% coverage): [list]
High (0-50% coverage): [list]
Medium (50-80% coverage): [list]
```

## Recommended Test Templates

### Agent Module Test
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('EventCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates event on all specified platforms', async () => {
    // Mock platform clients
    // Call agent with event data
    // Verify all platforms received the event
  });

  it('handles partial platform failure gracefully', async () => {
    // Mock one platform failing
    // Verify other platforms still succeed
    // Verify error is reported
  });
});
```

### Platform Integration Test
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MeetupClient', () => {
  it('publishes event with correct format', async () => {
    // Mock HTTP client
    // Call publish
    // Verify request format matches Meetup API spec
  });

  it('handles rate limiting', async () => {
    // Mock 429 response
    // Verify retry behavior
  });
});
```

## Key Rule

**Never hit real external APIs in tests.** All platform integrations must be mocked. Use dependency injection or `vi.mock()` to replace HTTP clients.

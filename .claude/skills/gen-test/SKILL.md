---
name: gen-test
description: Generate unit tests for agent modules and platform integrations
disable-model-invocation: false
context: fork
---

# Test Generator for SocialiseHub

Generates comprehensive unit tests for agent modules, platform integrations, and utilities.

## Usage

```
/gen-test src/agents/event-creator.ts
/gen-test src/tools/meetup.ts
/gen-test src/lib/data-transform.ts
```

## Testing Framework

- **Framework**: Vitest
- **Coverage target**: 80%+ on new code

## Conventions

1. **File naming**: `{fileName}.test.ts`
2. **Test placement**: Same directory as source file
3. **Agent tests**: Focus on input/output behavior and error handling
4. **Platform tests**: Mock all HTTP calls — never hit real APIs
5. **Mock patterns**:
   - Mock HTTP clients with `vi.mock()`
   - Mock platform APIs with fixture data
   - Mock file system for image operations

## What Gets Generated

### Agent Module Tests
- Agent processes input correctly
- Handles missing or invalid data
- Error scenarios (API failures, rate limits)
- Multi-platform publishing (partial failures)

### Platform Integration Tests
- API request format matches platform spec
- Response parsing handles all fields
- Rate limiting and retry behavior
- Authentication header construction
- Error response handling

## Key Test Patterns

**Agent test example:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventCreator } from './event-creator';

describe('EventCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes to all specified platforms', async () => {
    const mockMeetup = { publish: vi.fn().mockResolvedValue({ id: '123' }) };
    const creator = new EventCreator({ meetup: mockMeetup });

    await creator.create({ title: 'Test Event', platforms: ['meetup'] });
    expect(mockMeetup.publish).toHaveBeenCalledOnce();
  });

  it('reports failures without blocking other platforms', async () => {
    const mockMeetup = { publish: vi.fn().mockRejectedValue(new Error('API down')) };
    const mockHeadfirst = { publish: vi.fn().mockResolvedValue({ id: '456' }) };
    const creator = new EventCreator({ meetup: mockMeetup, headfirst: mockHeadfirst });

    const result = await creator.create({ title: 'Test', platforms: ['meetup', 'headfirst'] });
    expect(result.failures).toHaveLength(1);
    expect(result.successes).toHaveLength(1);
  });
});
```

**Platform integration test example:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { MeetupClient } from './meetup';

describe('MeetupClient', () => {
  it('formats event for Meetup API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ id: '123' }) });

    const client = new MeetupClient({ fetch: mockFetch, apiKey: 'test-key' });
    await client.publish({ title: 'Coffee Meetup', date: '2026-04-01' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('meetup.com'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

## Critical Rule

**Never hit real external APIs in tests.** All platform integrations must be mocked.

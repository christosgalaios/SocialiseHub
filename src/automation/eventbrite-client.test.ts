// src/automation/eventbrite-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventbriteAutomationClient } from './eventbrite-client.js';

vi.mock('./bridge.js', () => ({
  requestAutomation: vi.fn(),
}));

import { requestAutomation } from './bridge.js';
const mockRequest = requestAutomation as ReturnType<typeof vi.fn>;

describe('EventbriteAutomationClient', () => {
  let client: EventbriteAutomationClient;

  beforeEach(() => {
    client = new EventbriteAutomationClient({ getExtra: () => ({ organizationId: 'org-123' }) });
    mockRequest.mockReset();
  });

  it('validateConnection returns true when logged in', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '{"loggedIn":true,"organizationId":"123"}' },
    });
    expect(await client.validateConnection()).toBe(true);
  });

  it('validateConnection returns false when not logged in', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '{"loggedIn":false}' },
    });
    expect(await client.validateConnection()).toBe(false);
  });

  it('createEvent returns publish result with externalId', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '{"externalId":"99","externalUrl":"https://eventbrite.com/myevent?eid=99"}' },
    });
    const result = await client.createEvent({ id: '1', title: 'Test' } as never);
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('99');
  });

  it('fetchEvents returns parsed events', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '[{"externalId":"1","title":"EB Event","url":"https://eventbrite.com/e/1","date":"2026-04-01"}]' },
    });
    const events = await client.fetchEvents();
    expect(events).toHaveLength(1);
    expect(events[0].platform).toBe('eventbrite');
  });
});

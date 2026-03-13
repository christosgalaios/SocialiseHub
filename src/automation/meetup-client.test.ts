import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetupAutomationClient } from './meetup-client.js';

vi.mock('./bridge.js', () => ({
  requestAutomation: vi.fn(),
}));

import { requestAutomation } from './bridge.js';
const mockRequest = requestAutomation as ReturnType<typeof vi.fn>;

describe('MeetupAutomationClient', () => {
  let client: MeetupAutomationClient;

  beforeEach(() => {
    client = new MeetupAutomationClient('socialise-bristol');
    mockRequest.mockReset();
  });

  it('validateConnection returns true when logged in', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '{"loggedIn":true,"groupUrlname":"socialise-bristol"}' },
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
      data: { lastEvalResult: '{"externalId":"12345","externalUrl":"https://meetup.com/events/12345"}' },
    });
    const result = await client.createEvent({ id: '1', title: 'Test' } as never);
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('12345');
  });

  it('fetchEvents returns parsed events', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '[{"externalId":"1","title":"Event 1","url":"https://meetup.com/e/1","date":"2026-04-01","venue":"Pub"}]' },
    });
    const events = await client.fetchEvents();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Event 1');
    expect(events[0].platform).toBe('meetup');
  });
});

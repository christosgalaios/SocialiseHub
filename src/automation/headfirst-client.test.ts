// src/automation/headfirst-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeadfirstAutomationClient } from './headfirst-client.js';

vi.mock('./bridge.js', () => ({
  requestAutomation: vi.fn(),
}));

import { requestAutomation } from './bridge.js';
const mockRequest = requestAutomation as ReturnType<typeof vi.fn>;

describe('HeadfirstAutomationClient', () => {
  let client: HeadfirstAutomationClient;

  beforeEach(() => {
    client = new HeadfirstAutomationClient({ getExtra: () => ({ organizationId: 'org-456' }) });
    mockRequest.mockReset();
  });

  it('validateConnection returns true when logged in', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '{"loggedIn":true}' },
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

  it('createEvent returns result with externalId', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '{"externalId":"42","externalUrl":"https://headfirstbristol.co.uk/event/42"}' },
    });
    const result = await client.createEvent({ id: '1', title: 'Test' } as never);
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('42');
  });

  it('fetchEvents returns parsed events', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      data: { lastEvalResult: '[{"externalId":"1","title":"HF Event","url":"https://headfirstbristol.co.uk/event/1","date":"2026-04-01","venue":"The Lanes"}]' },
    });
    const events = await client.fetchEvents();
    expect(events).toHaveLength(1);
    expect(events[0].platform).toBe('headfirst');
    expect(events[0].venue).toBe('The Lanes');
  });
});

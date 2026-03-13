import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestAutomation, getBridgeUrl } from './bridge.js';

describe('requestAutomation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST request to the bridge and returns result', async () => {
    const mockResult = { success: true, data: { externalUrl: 'https://meetup.com/event/123' } };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    const result = await requestAutomation({
      platform: 'meetup',
      action: 'publish',
      data: { id: '1', title: 'Test' } as never,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/automation/execute'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.success).toBe(true);
  });

  it('returns failure on HTTP error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ error: 'Engine not ready' }),
    });

    const result = await requestAutomation({ platform: 'meetup', action: 'connect' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Engine not ready');
  });
});

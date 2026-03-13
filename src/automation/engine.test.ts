import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationEngine } from './engine.js';
import type { AutomationStep, AutomationStatus } from './types.js';

function createMockWebContents() {
  return {
    loadURL: vi.fn().mockResolvedValue(undefined),
    executeJavaScript: vi.fn().mockResolvedValue(null),
    getURL: vi.fn().mockReturnValue('https://example.com'),
    once: vi.fn(),
    setUserAgent: vi.fn(),
  };
}

describe('AutomationEngine', () => {
  let engine: AutomationEngine;
  let mockWC: ReturnType<typeof createMockWebContents>;

  beforeEach(() => {
    mockWC = createMockWebContents();
    engine = new AutomationEngine(mockWC as never);
  });

  it('executes a navigate step', async () => {
    const steps: AutomationStep[] = [
      { action: 'navigate', url: 'https://meetup.com', description: 'Opening Meetup' },
    ];
    const result = await engine.run(steps);
    expect(mockWC.loadURL).toHaveBeenCalledWith('https://meetup.com');
    expect(result.success).toBe(true);
  });

  it('executes a fill step', async () => {
    mockWC.executeJavaScript.mockResolvedValue(true);
    const steps: AutomationStep[] = [
      { action: 'fill', selector: '#title', value: 'My Event', description: 'Filling title' },
    ];
    const result = await engine.run(steps);
    expect(mockWC.executeJavaScript).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('executes a click step', async () => {
    mockWC.executeJavaScript.mockResolvedValue(true);
    const steps: AutomationStep[] = [
      { action: 'click', selector: '#submit', description: 'Clicking submit' },
    ];
    const result = await engine.run(steps);
    expect(mockWC.executeJavaScript).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('executes an evaluate step and returns data', async () => {
    mockWC.executeJavaScript.mockResolvedValue('extracted-id-123');
    const steps: AutomationStep[] = [
      { action: 'evaluate', script: 'document.querySelector(".id").textContent', description: 'Extracting ID' },
    ];
    const result = await engine.run(steps);
    expect(result.success).toBe(true);
    expect(result.data?.lastEvalResult).toBe('extracted-id-123');
  });

  it('emits status updates for each step', async () => {
    const statuses: AutomationStatus[] = [];
    engine.onStatus((s) => statuses.push({ ...s }));

    const steps: AutomationStep[] = [
      { action: 'navigate', url: 'https://meetup.com', description: 'Step 1' },
      { action: 'navigate', url: 'https://eventbrite.com', description: 'Step 2' },
    ];
    await engine.run(steps);
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(statuses[0].description).toBe('Step 1');
    expect(statuses[0].step).toBe(1);
    expect(statuses[0].totalSteps).toBe(2);
  });

  it('returns failure when a selector is not found (timeout)', async () => {
    mockWC.executeJavaScript.mockRejectedValue(new Error('Element not found'));
    const steps: AutomationStep[] = [
      { action: 'fill', selector: '#nonexistent', value: 'test', timeout: 100, description: 'Fill missing field' },
    ];
    const result = await engine.run(steps);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Element not found');
  });

  it('handles waitForSelector with polling', async () => {
    mockWC.executeJavaScript
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const steps: AutomationStep[] = [
      { action: 'waitForSelector', selector: '.loaded', timeout: 2000, description: 'Waiting for page' },
    ];
    const result = await engine.run(steps);
    expect(result.success).toBe(true);
  });
});

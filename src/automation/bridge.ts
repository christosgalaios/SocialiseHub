import type { AutomationRequest, AutomationResult } from './types.js';

const BRIDGE_PORT = 39847;

export function getBridgeUrl(): string {
  return `http://127.0.0.1:${BRIDGE_PORT}`;
}

export function getBridgePort(): number {
  return BRIDGE_PORT;
}

export async function requestAutomation(request: AutomationRequest): Promise<AutomationResult> {
  const res = await fetch(`${getBridgeUrl()}/automation/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return { success: false, error: (body as { error?: string }).error ?? res.statusText };
  }

  return (await res.json()) as AutomationResult;
}

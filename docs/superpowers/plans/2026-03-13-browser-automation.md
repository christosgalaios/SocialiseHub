# Browser Automation Platform Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OAuth/API platform integrations with browser automation using Electron's WebContentsView, so users can publish events and sync data by driving real platform websites from within the app.

**Architecture:** AutomationEngine in the Electron main process manages a WebContentsView to execute step-based browser scripts. Platform-specific scripts (Meetup, Eventbrite, Headfirst) implement the existing PlatformClient interface via an internal HTTP bridge between Express and Electron. The automation view is visible to the user during execution.

**Tech Stack:** Electron (BaseWindow, WebContentsView, ipcMain), TypeScript, Express internal bridge

**Spec:** `docs/superpowers/specs/2026-03-13-browser-automation-design.md`

---

## Chunk 1: Foundation — Types, Engine, IPC Bridge

### Task 1: Automation Types

**Files:**
- Create: `src/automation/types.ts`

- [ ] **Step 1: Create the automation types file**

```typescript
// src/automation/types.ts
import type { PlatformName, SocialiseEvent } from '../shared/types.js';

export interface AutomationStep {
  action: 'navigate' | 'waitForSelector' | 'fill' | 'click' | 'evaluate' | 'extractText' | 'waitForNavigation' | 'pause';
  selector?: string;
  value?: string;
  url?: string;
  script?: string;
  timeout?: number;
  description: string;
}

export interface AutomationTask {
  platform: PlatformName;
  action: 'connect' | 'publish' | 'update' | 'cancel' | 'scrape';
  data?: SocialiseEvent;
  steps: AutomationStep[];
}

export interface AutomationResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface AutomationStatus {
  step: number;
  totalSteps: number;
  description: string;
  state: 'running' | 'paused' | 'waiting_for_user' | 'completed' | 'failed';
}

export interface AutomationRequest {
  platform: PlatformName;
  action: 'connect' | 'publish' | 'update' | 'cancel' | 'scrape';
  data?: SocialiseEvent;
  externalId?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/automation/types.ts
git commit -m "feat: add automation types for browser-based platform integration"
```

---

### Task 2: AutomationEngine — Core Step Execution

**Files:**
- Create: `src/automation/engine.ts`
- Create: `src/automation/engine.test.ts`

The AutomationEngine runs in the Electron main process. It takes a `WebContents` object and executes `AutomationStep[]` sequentially. Each step drives the browser: navigate, wait, fill, click, evaluate JS, extract text.

- [ ] **Step 1: Write failing tests for the engine**

```typescript
// src/automation/engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationEngine } from './engine.js';
import type { AutomationStep, AutomationStatus } from './types.js';

// Mock WebContents — simulates Electron's webContents API
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
    // First call: not found. Second call: found.
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/automation/engine.test.ts`
Expected: FAIL — `AutomationEngine` does not exist

- [ ] **Step 3: Implement AutomationEngine**

```typescript
// src/automation/engine.ts
import type { AutomationStep, AutomationResult, AutomationStatus } from './types.js';

/** Minimal interface matching Electron's WebContents for the methods we use. */
export interface AutomationWebContents {
  loadURL(url: string): Promise<void>;
  executeJavaScript(code: string): Promise<unknown>;
  getURL(): string;
  setUserAgent(ua: string): void;
}

const DEFAULT_TIMEOUT = 10_000;
const POLL_INTERVAL = 300;
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class AutomationEngine {
  private wc: AutomationWebContents;
  private statusListeners: Array<(s: AutomationStatus) => void> = [];
  private lastEvalResult: unknown = null;
  private cancelled = false;

  constructor(webContents: AutomationWebContents) {
    this.wc = webContents;
    this.wc.setUserAgent(CHROME_UA);
  }

  onStatus(listener: (s: AutomationStatus) => void): void {
    this.statusListeners.push(listener);
  }

  cancel(): void {
    this.cancelled = true;
  }

  async run(steps: AutomationStep[]): Promise<AutomationResult> {
    this.cancelled = false;
    this.lastEvalResult = null;

    for (let i = 0; i < steps.length; i++) {
      if (this.cancelled) {
        return { success: false, error: 'Cancelled by user' };
      }

      const step = steps[i];
      this.emitStatus({
        step: i + 1,
        totalSteps: steps.length,
        description: step.description,
        state: 'running',
      });

      try {
        await this.executeStep(step);
      } catch (err) {
        this.emitStatus({
          step: i + 1,
          totalSteps: steps.length,
          description: step.description,
          state: 'failed',
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          data: this.lastEvalResult != null ? { lastEvalResult: this.lastEvalResult } : undefined,
        };
      }
    }

    this.emitStatus({
      step: steps.length,
      totalSteps: steps.length,
      description: 'Complete',
      state: 'completed',
    });

    return {
      success: true,
      data: this.lastEvalResult != null ? { lastEvalResult: this.lastEvalResult } : undefined,
    };
  }

  private async executeStep(step: AutomationStep): Promise<void> {
    const timeout = step.timeout ?? DEFAULT_TIMEOUT;

    switch (step.action) {
      case 'navigate':
        if (!step.url) throw new Error('Navigate step requires url');
        await this.wc.loadURL(step.url);
        break;

      case 'waitForSelector':
        if (!step.selector) throw new Error('waitForSelector requires selector');
        await this.pollForSelector(step.selector, timeout);
        break;

      case 'fill':
        if (!step.selector) throw new Error('Fill step requires selector');
        await this.pollForSelector(step.selector, timeout);
        await this.wc.executeJavaScript(
          `(() => {
            const el = document.querySelector(${JSON.stringify(step.selector)});
            if (!el) throw new Error('Element not found: ${step.selector}');
            el.focus();
            el.value = ${JSON.stringify(step.value ?? '')};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })()`
        );
        break;

      case 'click':
        if (!step.selector) throw new Error('Click step requires selector');
        await this.pollForSelector(step.selector, timeout);
        await this.wc.executeJavaScript(
          `(() => {
            const el = document.querySelector(${JSON.stringify(step.selector)});
            if (!el) throw new Error('Element not found: ${step.selector}');
            el.click();
            return true;
          })()`
        );
        break;

      case 'evaluate':
        if (!step.script) throw new Error('Evaluate step requires script');
        this.lastEvalResult = await this.wc.executeJavaScript(step.script);
        break;

      case 'extractText':
        if (!step.selector) throw new Error('extractText requires selector');
        await this.pollForSelector(step.selector, timeout);
        this.lastEvalResult = await this.wc.executeJavaScript(
          `document.querySelector(${JSON.stringify(step.selector)})?.textContent?.trim() ?? null`
        );
        break;

      case 'waitForNavigation':
        await this.waitForNavChange(timeout);
        break;

      case 'pause':
        // In real usage, this sets state to waiting_for_user.
        // For now, it's a no-op in the engine — the caller handles pause/resume.
        break;
    }
  }

  private async pollForSelector(selector: string, timeout: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this.wc.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
      if (found) return;
      await this.sleep(POLL_INTERVAL);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  private async waitForNavChange(timeout: number): Promise<void> {
    const startUrl = this.wc.getURL();
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.wc.getURL() !== startUrl) return;
      await this.sleep(POLL_INTERVAL);
    }
    throw new Error('Timeout waiting for navigation');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private emitStatus(status: AutomationStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/automation/engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/automation/engine.ts src/automation/engine.test.ts
git commit -m "feat: implement AutomationEngine with step-based browser execution"
```

---

### Task 3: IPC Bridge — Preload & Main Process Handlers

**Files:**
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`

Add automation IPC channels to the preload script and register handlers in the main process. This task also creates the AutomationView (WebContentsView) with a persistent session partition.

- [ ] **Step 1: Add automation IPC channels to preload**

Add the following to `electron/preload.ts`, inside the `contextBridge.exposeInMainWorld('electronAPI', {` block, after the `executeInApp` entry:

```typescript
  // ── Browser Automation ──

  /** Start a browser automation task (connect, publish, scrape) */
  startAutomation: (request: { platform: string; action: string; data?: unknown; externalId?: string }) =>
    ipcRenderer.invoke('automation:start', request),

  /** Cancel the currently running automation task */
  cancelAutomation: () => ipcRenderer.invoke('automation:cancel'),

  /** Resume automation after user intervention (login, CAPTCHA) */
  resumeAutomation: () => ipcRenderer.invoke('automation:resume'),

  /** Subscribe to automation status updates. Returns cleanup function. */
  onAutomationStatus: (callback: (status: { step: number; totalSteps: number; description: string; state: string }) => void) => {
    const handler = (_event: unknown, status: { step: number; totalSteps: number; description: string; state: string }) => callback(status);
    ipcRenderer.on('automation:status', handler);
    return () => { ipcRenderer.removeListener('automation:status', handler); };
  },

  /** Subscribe to automation result. Returns cleanup function. */
  onAutomationResult: (callback: (result: { success: boolean; error?: string; data?: Record<string, unknown> }) => void) => {
    const handler = (_event: unknown, result: { success: boolean; error?: string; data?: Record<string, unknown> }) => callback(result);
    ipcRenderer.on('automation:result', handler);
    return () => { ipcRenderer.removeListener('automation:result', handler); };
  },
```

- [ ] **Step 2: Add AutomationView and IPC handlers to electron/main.ts**

Add near the top of the file, after the window state variables (after line ~213):

```typescript
// ── Automation state ─────────────────────────────────
let automationView: WebContentsView | null = null;
let automationViewAttached = false;
let automationEngine: AutomationEngine | null = null;
```

Add the import at the top of `electron/main.ts`:
```typescript
import { AutomationEngine } from '../dist/automation/engine.js';
```

Add a `layoutWithAutomation` function near the existing `layoutViews`:
```typescript
function layoutWithAutomation(win: BaseWindow, panelWidth: number): void {
  if (!appView || !automationView) return;
  const { width, height } = win.getContentBounds();

  // When automation is showing, it takes the right panel space
  const appWidth = Math.max(400, width - panelWidth);
  const autoWidth = width - appWidth;
  appView.setBounds({ x: 0, y: 0, width: appWidth, height });
  automationView.setBounds({ x: appWidth, y: 0, width: autoWidth, height });
}

function showAutomationView(win: BaseWindow, panelWidth: number): void {
  if (!automationView) {
    automationView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:automation',
      },
    });
  }

  // Hide Claude panel if open
  if (claudeViewAttached && claudeView) {
    win.contentView.removeChildView(claudeView);
    claudeViewAttached = false;
  }

  if (!automationViewAttached) {
    win.contentView.addChildView(automationView);
    automationViewAttached = true;
  }

  layoutWithAutomation(win, panelWidth);
}

function hideAutomationView(win: BaseWindow, panelWidth: number): void {
  if (automationViewAttached && automationView) {
    win.contentView.removeChildView(automationView);
    automationViewAttached = false;
  }

  // Restore previous layout (Claude or full-width)
  layoutViews(win, panelWidth);
}
```

Register IPC handlers inside the `app.whenReady()` block (or wherever the other IPC handlers are registered):

```typescript
  ipcMain.handle('automation:start', async (_event, request) => {
    if (!mainWindow || !automationView) {
      const config = loadConfig();
      const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
      showAutomationView(mainWindow!, panelWidth);
    }

    // Create engine from the automation view's webContents
    automationEngine = new AutomationEngine(automationView!.webContents as never);

    // Forward status updates to the renderer
    automationEngine.onStatus((status) => {
      appView?.webContents.send('automation:status', status);
    });

    // The actual script execution will be triggered by the internal HTTP bridge (Task 4)
    // For now, return acknowledgment
    return { started: true };
  });

  ipcMain.handle('automation:cancel', async () => {
    automationEngine?.cancel();
    if (mainWindow) {
      const config = loadConfig();
      hideAutomationView(mainWindow, config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH);
    }
    return { cancelled: true };
  });

  ipcMain.handle('automation:resume', async () => {
    // Resume is handled by the engine's pause/resume mechanism
    // For now, this is a placeholder that the platform scripts will use
    return { resumed: true };
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit` and `npx tsc --noEmit -p electron/tsconfig.json`
Expected: No errors (may need to adjust imports)

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts electron/main.ts
git commit -m "feat: add AutomationView and IPC bridge for browser automation"
```

---

### Task 4: Internal HTTP Bridge — Express ↔ Electron

**Files:**
- Create: `src/automation/bridge.ts`
- Create: `src/automation/bridge.test.ts`
- Modify: `electron/main.ts` (register the bridge endpoint)

The Express server needs to trigger automation in the Electron main process. Since they're in different contexts, we use an internal HTTP endpoint that the Electron main process exposes. The automation-backed PlatformClient implementations call this endpoint.

- [ ] **Step 1: Write the bridge client (used by Express-side code)**

```typescript
// src/automation/bridge.ts
import type { AutomationRequest, AutomationResult } from './types.js';

const BRIDGE_PORT = 39847; // Internal-only port for Electron ↔ Express communication

export function getBridgeUrl(): string {
  return `http://127.0.0.1:${BRIDGE_PORT}`;
}

export function getBridgePort(): number {
  return BRIDGE_PORT;
}

/**
 * Sends an automation request to the Electron main process via the internal HTTP bridge.
 * Called by the automation-backed PlatformClient implementations.
 */
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
```

- [ ] **Step 2: Write tests for the bridge client**

```typescript
// src/automation/bridge.test.ts
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
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/bridge.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Add bridge server in electron/main.ts**

Inside `app.whenReady()`, after the Express server starts, add the internal bridge HTTP server:

```typescript
  // ── Internal automation bridge server ──
  // Separate from the main Express server — only listens on 127.0.0.1
  const http = await import('node:http');
  const bridgeServer = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/automation/execute') {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          // Placeholder — Task 14 replaces this block with real platform dispatch.
          // Until then, bridge requests return a stub error so callers handle gracefully.
          const config = loadConfig();
          const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
          showAutomationView(mainWindow!, panelWidth);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Platform scripts not yet wired — see Task 14' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: String(err) }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const { getBridgePort } = await import('../dist/automation/bridge.js' as string);
  bridgeServer.listen(getBridgePort(), '127.0.0.1', () => {
    console.log(`Automation bridge listening on http://127.0.0.1:${getBridgePort()}`);
  });
```

- [ ] **Step 5: Commit**

```bash
git add src/automation/bridge.ts src/automation/bridge.test.ts electron/main.ts
git commit -m "feat: add internal HTTP bridge for Express ↔ Electron automation communication"
```

---

## Chunk 2: Meetup Platform Scripts

### Task 5: Meetup Connect Script

**Files:**
- Create: `src/automation/meetup.ts`
- Create: `src/automation/meetup.test.ts`

- [ ] **Step 1: Write the Meetup connect script**

```typescript
// src/automation/meetup.ts
import type { AutomationStep } from './types.js';

/** URL selectors — centralized so they're easy to update when Meetup changes their UI */
const SELECTORS = {
  loggedInAvatar: '[data-testid="avatar"], .member-menu, img[alt*="profile"]',
  groupLink: 'a[href*="/groups/"]',
  groupName: '[data-testid="group-name"], .groupHomeHeader-groupName, h1',
};

/**
 * Steps to check if the user is logged into Meetup.
 * Returns: lastEvalResult = { loggedIn: boolean, groupUrlname?: string }
 */
export function meetupConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.meetup.com/home/',
      description: 'Opening Meetup...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const avatar = document.querySelector('${SELECTORS.loggedInAvatar}');
        if (!avatar) return JSON.stringify({ loggedIn: false });
        // Try to find group URL from the page
        const groupLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        const groupUrlname = groupLinks.length > 0
          ? groupLinks[0].getAttribute('href')?.match(/\\/([^\\/]+)\\/?$/)?.[1] ?? null
          : null;
        return JSON.stringify({ loggedIn: true, groupUrlname });
      })()`,
      description: 'Checking login status...',
    },
  ];
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/automation/meetup.test.ts
import { describe, it, expect } from 'vitest';
import { meetupConnectSteps } from './meetup.js';

describe('meetupConnectSteps', () => {
  it('returns steps starting with navigate to meetup.com', () => {
    const steps = meetupConnectSteps();
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].url).toContain('meetup.com');
  });

  it('includes an evaluate step to check login status', () => {
    const steps = meetupConnectSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('loggedIn');
  });

  it('all steps have descriptions', () => {
    const steps = meetupConnectSteps();
    for (const step of steps) {
      expect(step.description).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/meetup.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/automation/meetup.ts src/automation/meetup.test.ts
git commit -m "feat: add Meetup connect automation script"
```

---

### Task 6: Meetup Publish Script

**Files:**
- Modify: `src/automation/meetup.ts`
- Modify: `src/automation/meetup.test.ts`

- [ ] **Step 1: Add publish steps to meetup.ts**

Add to `src/automation/meetup.ts`:

```typescript
import type { SocialiseEvent } from '../shared/types.js';

const PUBLISH_SELECTORS = {
  titleInput: '[data-testid="event-name-input"], input[name="name"], #event-name',
  descriptionEditor: '[data-testid="event-description"] [contenteditable], .ql-editor, [contenteditable="true"]',
  dateInput: '[data-testid="event-date-input"], input[type="date"], input[name="date"]',
  timeInput: '[data-testid="event-time-input"], input[type="time"], input[name="time"]',
  publishButton: '[data-testid="publish-button"], button[type="submit"]:last-of-type',
};

/**
 * Steps to publish an event on Meetup.
 * Requires groupUrlname to have been detected during connect.
 */
export function meetupPublishSteps(event: SocialiseEvent, groupUrlname: string): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = startDate.toTimeString().slice(0, 5);   // HH:MM

  return [
    {
      action: 'navigate',
      url: `https://www.meetup.com/${groupUrlname}/events/create/`,
      description: 'Opening event creation page...',
    },
    {
      action: 'waitForSelector',
      selector: PUBLISH_SELECTORS.titleInput,
      timeout: 15_000,
      description: 'Waiting for form to load...',
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.titleInput,
      value: event.title,
      description: `Filling title: "${event.title}"`,
    },
    {
      action: 'evaluate',
      script: `(() => {
        const editor = document.querySelector('${PUBLISH_SELECTORS.descriptionEditor}');
        if (editor) {
          editor.innerHTML = ${JSON.stringify(event.description)};
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()`,
      description: 'Filling description...',
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.dateInput,
      value: dateStr,
      description: `Setting date: ${dateStr}`,
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.timeInput,
      value: timeStr,
      description: `Setting time: ${timeStr}`,
    },
    {
      action: 'click',
      selector: PUBLISH_SELECTORS.publishButton,
      description: 'Publishing event...',
    },
    {
      action: 'waitForNavigation',
      timeout: 15_000,
      description: 'Waiting for confirmation...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const match = url.match(/events\\/(\\d+)/);
        return JSON.stringify({
          externalId: match ? match[1] : null,
          externalUrl: url,
        });
      })()`,
      description: 'Extracting event ID...',
    },
  ];
}
```

- [ ] **Step 2: Add tests**

Append to `src/automation/meetup.test.ts`:

```typescript
import { meetupPublishSteps } from './meetup.js';
import type { SocialiseEvent } from '../shared/types.js';

const mockEvent: SocialiseEvent = {
  id: '1',
  title: 'Test Event',
  description: 'A test event description',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'Test Venue',
  price: 0,
  capacity: 50,
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('meetupPublishSteps', () => {
  it('navigates to the group create-event page', () => {
    const steps = meetupPublishSteps(mockEvent, 'socialise-bristol');
    expect(steps[0].url).toContain('socialise-bristol/events/create');
  });

  it('fills the title', () => {
    const steps = meetupPublishSteps(mockEvent, 'socialise-bristol');
    const fillTitle = steps.find(s => s.action === 'fill' && s.description.includes('title'));
    expect(fillTitle).toBeDefined();
    expect(fillTitle!.value).toBe('Test Event');
  });

  it('ends with an evaluate step that extracts the event ID', () => {
    const steps = meetupPublishSteps(mockEvent, 'socialise-bristol');
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('evaluate');
    expect(lastStep.script).toContain('externalId');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/meetup.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/automation/meetup.ts src/automation/meetup.test.ts
git commit -m "feat: add Meetup publish automation script"
```

---

### Task 7: Meetup Scrape Script

**Files:**
- Modify: `src/automation/meetup.ts`
- Modify: `src/automation/meetup.test.ts`

- [ ] **Step 1: Add scrape steps to meetup.ts**

```typescript
/**
 * Steps to scrape upcoming events from a Meetup group.
 * Returns: lastEvalResult = JSON string of PlatformEvent[]
 */
export function meetupScrapeSteps(groupUrlname: string): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: `https://www.meetup.com/${groupUrlname}/events/`,
      description: 'Opening events list...',
    },
    {
      action: 'waitForSelector',
      selector: '[data-testid="event-card"], .eventCard, a[href*="/events/"]',
      timeout: 10_000,
      description: 'Waiting for events to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const cards = document.querySelectorAll('[data-testid="event-card"], .eventCard--link, [id^="event-card"]');
        const events = [];
        for (const card of cards) {
          const link = card.closest('a') ?? card.querySelector('a');
          const href = link?.getAttribute('href') ?? '';
          const idMatch = href.match(/events\\/(\\d+)/);
          const title = card.querySelector('h2, h3, [data-testid="event-name"]')?.textContent?.trim() ?? '';
          const dateEl = card.querySelector('time, [datetime], [data-testid="event-date"]');
          const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
          const venue = card.querySelector('[data-testid="event-venue"], .venue-name')?.textContent?.trim() ?? '';
          const attendees = card.querySelector('[data-testid="attendee-count"], .attendee-count')?.textContent?.match(/\\d+/)?.[0];
          if (title) {
            events.push({
              externalId: idMatch ? idMatch[1] : href,
              title,
              date,
              venue,
              url: href.startsWith('http') ? href : 'https://www.meetup.com' + href,
              attendees: attendees ? parseInt(attendees) : undefined,
            });
          }
        }
        return JSON.stringify(events);
      })()`,
      description: 'Scraping event data...',
    },
  ];
}
```

- [ ] **Step 2: Add tests**

```typescript
import { meetupScrapeSteps } from './meetup.js';

describe('meetupScrapeSteps', () => {
  it('navigates to the group events page', () => {
    const steps = meetupScrapeSteps('socialise-bristol');
    expect(steps[0].url).toContain('socialise-bristol/events');
  });

  it('includes an evaluate step that extracts event data', () => {
    const steps = meetupScrapeSteps('socialise-bristol');
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('externalId');
    expect(evalStep!.script).toContain('title');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/meetup.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/automation/meetup.ts src/automation/meetup.test.ts
git commit -m "feat: add Meetup scrape automation script"
```

---

## Chunk 3: Wiring — PlatformClient, PublishService, Services Page

### Task 8: Automation-backed PlatformClient for Meetup

**Files:**
- Create: `src/automation/meetup-client.ts`
- Create: `src/automation/meetup-client.test.ts`

This wraps the Meetup automation scripts into a `PlatformClient` implementation that communicates via the internal HTTP bridge.

- [ ] **Step 1: Implement MeetupAutomationClient**

```typescript
// src/automation/meetup-client.ts
import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

export class MeetupAutomationClient implements PlatformClient {
  readonly platform = 'meetup' as const;
  private groupUrlname: string;

  constructor(groupUrlname: string) {
    this.groupUrlname = groupUrlname;
  }

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'meetup', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'meetup', action: 'publish', data: event });
    if (!result.success) {
      return { platform: 'meetup', success: false, error: result.error ?? 'Publish failed' };
    }
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return {
      platform: 'meetup',
      success: true,
      externalId: data?.externalId ?? undefined,
      externalUrl: data?.externalUrl ?? undefined,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'meetup', action: 'update', data: event, externalId });
    if (!result.success) {
      return { platform: 'meetup', success: false, error: result.error ?? 'Update failed' };
    }
    return { platform: 'meetup', success: true, externalId };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await requestAutomation({ platform: 'meetup', action: 'cancel', externalId });
    return { success: result.success, error: result.error };
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const result = await requestAutomation({ platform: 'meetup', action: 'scrape' });
    if (!result.success) return [];
    const events = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : [];
    return events.map((e: Record<string, unknown>) => ({
      id: '',
      platform: 'meetup' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      startTime: String(e.date ?? ''),
      venue: String(e.venue ?? ''),
      syncedAt: new Date().toISOString(),
    }));
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/automation/meetup-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeetupAutomationClient } from './meetup-client.js';

// Mock the bridge
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
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/meetup-client.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/automation/meetup-client.ts src/automation/meetup-client.test.ts
git commit -m "feat: add MeetupAutomationClient implementing PlatformClient via browser bridge"
```

---

### Task 9: Update PublishService for Sequential Execution

**Files:**
- Modify: `src/tools/publish-service.ts`
- Modify: `src/tools/publish-service.test.ts` (if exists)

Change `Promise.allSettled` to sequential execution for automation-backed clients.

- [ ] **Step 1: Update publish method**

Replace the `publish` method in `src/tools/publish-service.ts`:

```typescript
  async publish(event: SocialiseEvent, platforms: PlatformName[]): Promise<PlatformPublishResult[]> {
    // Sequential execution — browser automation can only run one platform at a time
    const results: PlatformPublishResult[] = [];
    for (const p of platforms) {
      const client = this.clients[p];
      if (!client) {
        results.push({ platform: p, success: false, error: `${p} not configured` });
        continue;
      }
      try {
        results.push(await client.createEvent(event));
      } catch (err) {
        results.push({ platform: p, success: false, error: String(err) });
      }
    }
    return results;
  }
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/tools/publish-service.ts
git commit -m "refactor: change PublishService to sequential execution for browser automation"
```

---

### Task 10: Wire Automation Clients into App + Update Types

**Files:**
- Modify: `src/app.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/routes/auth.ts` — remove auth router import and route from app.ts (file deletion deferred to Task 15)
- Modify: `client/src/api/events.ts` — remove OAuth functions

- [ ] **Step 1: Update shared types — remove OAuth auth types**

In `src/shared/types.ts`, replace the Auth section:

```typescript
// ── Auth (removed — browser automation handles auth via session) ──
// PlatformAuthType and PLATFORM_AUTH_TYPES removed.
// Kept for reference: all platforms now use browser session authentication.
```

Delete lines 96-102 (`PlatformAuthType`, `PLATFORM_AUTH_TYPES`).

- [ ] **Step 2: Update app.ts — remove auth router, wire automation client**

In `src/app.ts`:
- Remove: `import { createAuthRouter } from './routes/auth.js';`
- Remove: `app.use('/auth', createAuthRouter(serviceStore, port));`
- Update PublishService initialization to use automation clients (for now, keep as empty — the Electron main process will provide them):

```typescript
  // PublishService — clients are provided when running inside Electron
  // In web-only mode (dev:web), automation is not available
  const publishService = new PublishService({});
```

- [ ] **Step 3: Remove OAuth functions from client API**

In `client/src/api/events.ts`, remove:
- `startOAuth` function
- `watchOAuthStatus` function
- `getOAuthStatus` function
- `OAuthSetupStatus` interface

Add:
```typescript
// ── Automation ──────────────────────────────────────────

export async function startAutomation(platform: PlatformName, action: string, data?: unknown): Promise<void> {
  if (window.electronAPI) {
    await (window.electronAPI as Record<string, Function>).startAutomation({ platform, action, data });
  }
}

export async function cancelAutomation(): Promise<void> {
  if (window.electronAPI) {
    await (window.electronAPI as Record<string, Function>).cancelAutomation();
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` and `npx tsc --noEmit -p client/tsconfig.json`
Expected: No errors (fix any import references to removed code)

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/shared/types.ts client/src/api/events.ts
git commit -m "refactor: remove OAuth/auth layer, add automation client API"
```

---

### Task 11: Update ServicesPage for Browser Automation

**Files:**
- Modify: `client/src/pages/ServicesPage.tsx`

Simplify the Services page: remove OAuth/credential forms, replace with a simple Connect button that triggers the automation view.

- [ ] **Step 1: Simplify ServicesPage**

Replace the connect/OAuth/credential logic with automation-based connect:

- Remove all OAuth state (`waitingOAuth`, `oauthStatus`, `showForm`, `formValues`)
- Remove `handleOAuthConnect`, `handleCredentialConnect`
- Replace with single `handleConnect` that calls `startAutomation(platform, 'connect')`
- Remove the setup instructions section, credential form, and OAuth-specific button variants
- Keep: disconnect, loading, error display, card layout
- Add: automation status display (subscribe to `onAutomationStatus`)

The connect button becomes:
```typescript
<button
  style={styles.connectBtn}
  onClick={() => handleConnect(svc.platform)}
  disabled={connecting === svc.platform}
>
  {connecting === svc.platform ? 'Connecting...' : 'Connect'}
</button>
```

- [ ] **Step 2: Update the Window type declaration**

Update the `electronAPI` interface in ServicesPage to include automation methods:
```typescript
interface Window {
  electronAPI?: {
    isElectron: boolean;
    openExternal: (url: string) => Promise<void>;
    copyToClipboard: (text: string) => Promise<void>;
    toggleClaudePanel: () => Promise<boolean>;
    focusClaudePanel: () => Promise<void>;
    isClaudePanelOpen: () => Promise<boolean>;
    startAutomation: (request: { platform: string; action: string; data?: unknown }) => Promise<void>;
    cancelAutomation: () => Promise<void>;
    resumeAutomation: () => Promise<void>;
    onAutomationStatus: (cb: (status: { step: number; totalSteps: number; description: string; state: string }) => void) => () => void;
    onAutomationResult: (cb: (result: { success: boolean; error?: string }) => void) => () => void;
  };
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ServicesPage.tsx
git commit -m "refactor: simplify ServicesPage for browser automation — remove OAuth UI"
```

---

## Chunk 4: Eventbrite & Headfirst Scripts

### Task 12: Eventbrite Automation Scripts

**Files:**
- Create: `src/automation/eventbrite.ts`
- Create: `src/automation/eventbrite.test.ts`
- Create: `src/automation/eventbrite-client.ts`
- Create: `src/automation/eventbrite-client.test.ts`

Eventbrite uses a multi-step wizard for event creation. Each step uses 15s timeouts because wizard transitions are slow. External ID is extracted from the URL pattern `eventbrite.com/myevent?eid={eventId}`.

- [ ] **Step 1: Implement eventbrite.ts**

```typescript
// src/automation/eventbrite.ts
import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const SELECTORS = {
  loggedInNav: '[data-testid="user-nav"], .global-header__avatar, .user-menu',
  orgIdLink: 'a[href*="/organizations/"]',
};

const PUBLISH_SELECTORS = {
  titleInput: '[data-testid="event-title-input"], input[name="title"], #event-title',
  descriptionEditor: '[data-testid="event-description"] [contenteditable], .ql-editor, [contenteditable="true"]',
  dateInput: '[data-testid="start-date"], input[name="startDate"], input[type="date"]',
  timeInput: '[data-testid="start-time"], input[name="startTime"], input[type="time"]',
  ticketTypeSelector: '[data-testid="ticket-type-selector"], .ticket-type-toggle',
  freeTicketOption: '[data-testid="free-ticket"], button:contains("Free"), .ticket-free-option',
  paidTicketOption: '[data-testid="paid-ticket"], button:contains("Paid"), .ticket-paid-option',
  ticketPriceInput: '[data-testid="ticket-price"], input[name="price"]',
  ticketQuantityInput: '[data-testid="ticket-quantity"], input[name="quantity"]',
  venueInput: '[data-testid="venue-input"], input[name="venue"], #venue-search',
  nextButton: '[data-testid="next-step"], button.eds-btn--submit, button[type="submit"]',
  publishButton: '[data-testid="publish-button"], button[data-testid="publish"], button.eds-btn--submit:last-of-type',
};

/**
 * Steps to check if the user is logged into Eventbrite.
 * Returns: lastEvalResult = { loggedIn: boolean, organizationId?: string }
 */
export function eventbriteConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.com/',
      description: 'Opening Eventbrite...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const nav = document.querySelector('${SELECTORS.loggedInNav}');
        if (!nav) return JSON.stringify({ loggedIn: false });
        const orgLink = document.querySelector('${SELECTORS.orgIdLink}');
        const orgMatch = orgLink?.getAttribute('href')?.match(/organizations\\/(\\d+)/);
        return JSON.stringify({ loggedIn: true, organizationId: orgMatch ? orgMatch[1] : null });
      })()`,
      description: 'Checking login status...',
    },
  ];
}

/**
 * Steps to publish an event on Eventbrite via the multi-step wizard.
 * Timeout: 15s per step (wizard transitions are slow).
 */
export function eventbritePublishSteps(event: SocialiseEvent): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.com/create',
      description: 'Opening event creation wizard...',
    },
    // Step 1: Basic info
    {
      action: 'waitForSelector',
      selector: PUBLISH_SELECTORS.titleInput,
      timeout: 15_000,
      description: 'Waiting for title field...',
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.titleInput,
      value: event.title,
      description: `Filling title: "${event.title}"`,
    },
    {
      action: 'evaluate',
      script: `(() => {
        const editor = document.querySelector('${PUBLISH_SELECTORS.descriptionEditor}');
        if (editor) {
          editor.innerHTML = ${JSON.stringify(event.description)};
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()`,
      description: 'Filling description...',
    },
    // Date/time step
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.dateInput,
      value: dateStr,
      description: `Setting date: ${dateStr}`,
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.timeInput,
      value: timeStr,
      description: `Setting time: ${timeStr}`,
    },
    // Location step
    ...(event.venue ? [
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.venueInput,
        value: event.venue,
        description: `Setting venue: ${event.venue}`,
      },
    ] : []),
    // Tickets step — free or paid
    ...(event.price && event.price > 0 ? [
      {
        action: 'click' as const,
        selector: PUBLISH_SELECTORS.paidTicketOption,
        description: 'Selecting paid ticket type...',
      },
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.ticketPriceInput,
        value: String(event.price),
        description: `Setting ticket price: £${event.price}`,
      },
    ] : [
      {
        action: 'click' as const,
        selector: PUBLISH_SELECTORS.freeTicketOption,
        description: 'Selecting free ticket type...',
      },
    ]),
    // Capacity
    ...(event.capacity ? [
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.ticketQuantityInput,
        value: String(event.capacity),
        description: `Setting capacity: ${event.capacity}`,
      },
    ] : []),
    // Publish
    {
      action: 'click',
      selector: PUBLISH_SELECTORS.publishButton,
      description: 'Publishing event...',
    },
    {
      action: 'waitForNavigation',
      timeout: 15_000,
      description: 'Waiting for confirmation...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const eidMatch = url.match(/eid=(\\d+)/);
        const pathMatch = url.match(/event\\/(\\d+)/);
        const externalId = eidMatch ? eidMatch[1] : pathMatch ? pathMatch[1] : null;
        return JSON.stringify({ externalId, externalUrl: url });
      })()`,
      description: 'Extracting event ID...',
    },
  ];
}

/**
 * Steps to scrape events from Eventbrite organizations dashboard.
 */
export function eventbriteScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.com/organizations/events/',
      description: 'Opening events dashboard...',
    },
    {
      action: 'waitForSelector',
      selector: '[data-testid="event-list-item"], .event-list-item, table tbody tr',
      timeout: 15_000,
      description: 'Waiting for events list to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const rows = document.querySelectorAll('[data-testid="event-list-item"], .event-list-item, table tbody tr');
        const events = [];
        for (const row of rows) {
          const link = row.querySelector('a[href*="/event/"], a[href*="eid="]');
          const href = link?.getAttribute('href') ?? '';
          const eidMatch = href.match(/eid=(\\d+)/) ?? href.match(/event\\/(\\d+)/);
          const title = row.querySelector('[data-testid="event-name"], .event-name, td:first-child a')?.textContent?.trim() ?? '';
          const dateEl = row.querySelector('time, [data-testid="event-date"], td:nth-child(2)');
          const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
          const status = row.querySelector('[data-testid="event-status"], .event-status')?.textContent?.trim() ?? '';
          if (title) {
            events.push({
              externalId: eidMatch ? eidMatch[1] : href,
              title,
              date,
              status,
              url: href.startsWith('http') ? href : 'https://www.eventbrite.com' + href,
            });
          }
        }
        return JSON.stringify(events);
      })()`,
      description: 'Scraping event data...',
    },
  ];
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/automation/eventbrite.test.ts
import { describe, it, expect } from 'vitest';
import { eventbriteConnectSteps, eventbritePublishSteps, eventbriteScrapeSteps } from './eventbrite.js';
import type { SocialiseEvent } from '../shared/types.js';

const mockEvent: SocialiseEvent = {
  id: '1',
  title: 'Test Event',
  description: 'A test description',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'Test Venue',
  price: 0,
  capacity: 100,
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('eventbriteConnectSteps', () => {
  it('navigates to eventbrite.com', () => {
    const steps = eventbriteConnectSteps();
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].url).toContain('eventbrite.com');
  });

  it('includes evaluate step checking login', () => {
    const steps = eventbriteConnectSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('loggedIn');
  });

  it('all steps have descriptions', () => {
    for (const step of eventbriteConnectSteps()) {
      expect(step.description).toBeTruthy();
    }
  });
});

describe('eventbritePublishSteps', () => {
  it('navigates to eventbrite.com/create', () => {
    const steps = eventbritePublishSteps(mockEvent);
    expect(steps[0].url).toContain('eventbrite.com/create');
  });

  it('fills the title', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const fillTitle = steps.find(s => s.action === 'fill' && s.description.includes('title'));
    expect(fillTitle).toBeDefined();
    expect(fillTitle!.value).toBe('Test Event');
  });

  it('uses 15s timeout for form load', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const waitStep = steps.find(s => s.action === 'waitForSelector');
    expect(waitStep!.timeout).toBe(15_000);
  });

  it('selects free ticket for price=0', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const freeClick = steps.find(s => s.description.includes('free ticket'));
    expect(freeClick).toBeDefined();
  });

  it('selects paid ticket and sets price for price>0', () => {
    const paidEvent = { ...mockEvent, price: 10 };
    const steps = eventbritePublishSteps(paidEvent);
    const paidClick = steps.find(s => s.description.includes('paid ticket'));
    const priceStep = steps.find(s => s.description.includes('price'));
    expect(paidClick).toBeDefined();
    expect(priceStep).toBeDefined();
    expect(priceStep!.value).toBe('10');
  });

  it('ends with evaluate extracting event ID from eid param', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('evaluate');
    expect(lastStep.script).toContain('eid=');
    expect(lastStep.script).toContain('externalId');
  });
});

describe('eventbriteScrapeSteps', () => {
  it('navigates to organizations events page', () => {
    const steps = eventbriteScrapeSteps();
    expect(steps[0].url).toContain('organizations/events');
  });

  it('includes evaluate extracting event data', () => {
    const steps = eventbriteScrapeSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('externalId');
    expect(evalStep!.script).toContain('title');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/eventbrite.test.ts`
Expected: All PASS

- [ ] **Step 4: Create EventbriteAutomationClient**

```typescript
// src/automation/eventbrite-client.ts
import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

export class EventbriteAutomationClient implements PlatformClient {
  readonly platform = 'eventbrite' as const;

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'publish', data: event });
    if (!result.success) {
      return { platform: 'eventbrite', success: false, error: result.error ?? 'Publish failed' };
    }
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return {
      platform: 'eventbrite',
      success: true,
      externalId: data?.externalId ?? undefined,
      externalUrl: data?.externalUrl ?? undefined,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'update', data: event, externalId });
    if (!result.success) {
      return { platform: 'eventbrite', success: false, error: result.error ?? 'Update failed' };
    }
    return { platform: 'eventbrite', success: true, externalId };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'cancel', externalId });
    return { success: result.success, error: result.error };
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const result = await requestAutomation({ platform: 'eventbrite', action: 'scrape' });
    if (!result.success) return [];
    const events = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : [];
    return events.map((e: Record<string, unknown>) => ({
      id: '',
      platform: 'eventbrite' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      startTime: String(e.date ?? ''),
      venue: '',
      syncedAt: new Date().toISOString(),
    }));
  }
}
```

- [ ] **Step 5: Write client tests**

```typescript
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
    client = new EventbriteAutomationClient();
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
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run src/automation/eventbrite.test.ts src/automation/eventbrite-client.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/automation/eventbrite.ts src/automation/eventbrite.test.ts src/automation/eventbrite-client.ts src/automation/eventbrite-client.test.ts
git commit -m "feat: add Eventbrite browser automation scripts and client"
```

---

### Task 13: Headfirst Automation Scripts

**Files:**
- Create: `src/automation/headfirst.ts`
- Create: `src/automation/headfirst.test.ts`
- Create: `src/automation/headfirst-client.ts`
- Create: `src/automation/headfirst-client.test.ts`

Headfirst Bristol uses a simple HTML form — no complex editor or wizard. Plain textarea for description, standard form fields.

- [ ] **Step 1: Implement headfirst.ts**

```typescript
// src/automation/headfirst.ts
import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const SELECTORS = {
  loggedInIndicator: '.user-menu, .account-nav, a[href*="/logout"], a[href*="/account"]',
};

const FORM_SELECTORS = {
  titleInput: 'input[name="title"], input[name="event_name"], #event-title',
  descriptionTextarea: 'textarea[name="description"], textarea[name="event_description"], #event-description',
  dateInput: 'input[name="date"], input[type="date"], #event-date',
  timeInput: 'input[name="time"], input[type="time"], #event-time',
  venueDropdown: 'select[name="venue"], select[name="venue_id"], #event-venue',
  venueTextInput: 'input[name="venue"], input[name="venue_name"]',
  priceInput: 'input[name="price"], input[name="ticket_price"], #event-price',
  submitButton: 'button[type="submit"], input[type="submit"]',
};

/**
 * Steps to check if the user is logged into Headfirst Bristol.
 * Returns: lastEvalResult = { loggedIn: boolean }
 */
export function headfirstConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/',
      description: 'Opening Headfirst Bristol...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const indicator = document.querySelector('${SELECTORS.loggedInIndicator}');
        return JSON.stringify({ loggedIn: !!indicator });
      })()`,
      description: 'Checking login status...',
    },
  ];
}

/**
 * Steps to publish an event on Headfirst Bristol.
 * Uses a simple HTML form — no complex editor or wizard.
 */
export function headfirstPublishSteps(event: SocialiseEvent): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/submit-event',
      description: 'Opening event submission form...',
    },
    {
      action: 'waitForSelector',
      selector: FORM_SELECTORS.titleInput,
      timeout: 10_000,
      description: 'Waiting for form to load...',
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.titleInput,
      value: event.title,
      description: `Filling title: "${event.title}"`,
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.descriptionTextarea,
      value: event.description,
      description: 'Filling description...',
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.dateInput,
      value: dateStr,
      description: `Setting date: ${dateStr}`,
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.timeInput,
      value: timeStr,
      description: `Setting time: ${timeStr}`,
    },
    // Venue — try dropdown first, fall back to text input
    ...(event.venue ? [
      {
        action: 'evaluate' as const,
        script: `(() => {
          const dropdown = document.querySelector('${FORM_SELECTORS.venueDropdown}');
          if (dropdown) {
            const options = Array.from(dropdown.querySelectorAll('option'));
            const match = options.find(o => o.textContent?.toLowerCase().includes(${JSON.stringify(event.venue.toLowerCase())}));
            if (match) { dropdown.value = match.value; dropdown.dispatchEvent(new Event('change', { bubbles: true })); return 'dropdown'; }
          }
          const textInput = document.querySelector('${FORM_SELECTORS.venueTextInput}');
          if (textInput) { textInput.value = ${JSON.stringify(event.venue)}; textInput.dispatchEvent(new Event('input', { bubbles: true })); return 'text'; }
          return 'not_found';
        })()`,
        description: `Setting venue: ${event.venue}`,
      },
    ] : []),
    // Price
    ...(event.price !== undefined ? [
      {
        action: 'fill' as const,
        selector: FORM_SELECTORS.priceInput,
        value: String(event.price),
        description: `Setting price: £${event.price}`,
      },
    ] : []),
    {
      action: 'click',
      selector: FORM_SELECTORS.submitButton,
      description: 'Submitting event...',
    },
    {
      action: 'waitForNavigation',
      timeout: 10_000,
      description: 'Waiting for confirmation...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const idMatch = url.match(/event\\/(\\d+)/) ?? url.match(/(\\d+)/);
        return JSON.stringify({
          externalId: idMatch ? idMatch[1] : null,
          externalUrl: url,
        });
      })()`,
      description: 'Extracting event ID...',
    },
  ];
}

/**
 * Steps to scrape events from a Headfirst Bristol user listing.
 */
export function headfirstScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/my-events',
      description: 'Opening my events...',
    },
    {
      action: 'waitForSelector',
      selector: '.event-card, .event-listing, a[href*="/event/"]',
      timeout: 10_000,
      description: 'Waiting for events to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const items = document.querySelectorAll('.event-card, .event-listing, [data-event-id]');
        const events = [];
        for (const item of items) {
          const link = item.querySelector('a[href*="/event/"]') ?? item.closest('a');
          const href = link?.getAttribute('href') ?? '';
          const idMatch = href.match(/event\\/(\\d+)/);
          const title = item.querySelector('h2, h3, .event-title')?.textContent?.trim() ?? '';
          const dateEl = item.querySelector('time, .event-date');
          const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
          const venue = item.querySelector('.event-venue, .venue')?.textContent?.trim() ?? '';
          if (title) {
            events.push({
              externalId: idMatch ? idMatch[1] : href,
              title,
              date,
              venue,
              url: href.startsWith('http') ? href : 'https://www.headfirstbristol.co.uk' + href,
            });
          }
        }
        return JSON.stringify(events);
      })()`,
      description: 'Scraping event data...',
    },
  ];
}
```

- [ ] **Step 2: Write tests**

```typescript
// src/automation/headfirst.test.ts
import { describe, it, expect } from 'vitest';
import { headfirstConnectSteps, headfirstPublishSteps, headfirstScrapeSteps } from './headfirst.js';
import type { SocialiseEvent } from '../shared/types.js';

const mockEvent: SocialiseEvent = {
  id: '1',
  title: 'Test Event',
  description: 'A test description',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'The Lanes',
  price: 5,
  capacity: 50,
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('headfirstConnectSteps', () => {
  it('navigates to headfirstbristol.co.uk', () => {
    const steps = headfirstConnectSteps();
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].url).toContain('headfirstbristol.co.uk');
  });

  it('includes evaluate step checking login', () => {
    const steps = headfirstConnectSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('loggedIn');
  });

  it('all steps have descriptions', () => {
    for (const step of headfirstConnectSteps()) {
      expect(step.description).toBeTruthy();
    }
  });
});

describe('headfirstPublishSteps', () => {
  it('navigates to submit-event page', () => {
    const steps = headfirstPublishSteps(mockEvent);
    expect(steps[0].url).toContain('submit-event');
  });

  it('fills title with plain fill action', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const fillTitle = steps.find(s => s.action === 'fill' && s.description.includes('title'));
    expect(fillTitle).toBeDefined();
    expect(fillTitle!.value).toBe('Test Event');
  });

  it('fills description as plain text (textarea, not contenteditable)', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const fillDesc = steps.find(s => s.action === 'fill' && s.description.includes('description'));
    expect(fillDesc).toBeDefined();
    expect(fillDesc!.selector).toContain('textarea');
  });

  it('handles venue with dropdown-first strategy', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const venueStep = steps.find(s => s.description.includes('venue'));
    expect(venueStep).toBeDefined();
    expect(venueStep!.script).toContain('dropdown');
  });

  it('sets the price', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const priceStep = steps.find(s => s.description.includes('price'));
    expect(priceStep).toBeDefined();
    expect(priceStep!.value).toBe('5');
  });

  it('ends with evaluate extracting event ID', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('evaluate');
    expect(lastStep.script).toContain('externalId');
  });
});

describe('headfirstScrapeSteps', () => {
  it('navigates to my-events page', () => {
    const steps = headfirstScrapeSteps();
    expect(steps[0].url).toContain('my-events');
  });

  it('includes evaluate extracting event data', () => {
    const steps = headfirstScrapeSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('externalId');
    expect(evalStep!.script).toContain('title');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/automation/headfirst.test.ts`
Expected: All PASS

- [ ] **Step 4: Create HeadfirstAutomationClient**

```typescript
// src/automation/headfirst-client.ts
import type { PlatformClient } from '../tools/platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';
import { requestAutomation } from './bridge.js';

export class HeadfirstAutomationClient implements PlatformClient {
  readonly platform = 'headfirst' as const;

  async validateConnection(): Promise<boolean> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'connect' });
    if (!result.success) return false;
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return data?.loggedIn === true;
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'publish', data: event });
    if (!result.success) {
      return { platform: 'headfirst', success: false, error: result.error ?? 'Publish failed' };
    }
    const data = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : result.data?.lastEvalResult;
    return {
      platform: 'headfirst',
      success: true,
      externalId: data?.externalId ?? undefined,
      externalUrl: data?.externalUrl ?? undefined,
    };
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'update', data: event, externalId });
    if (!result.success) {
      return { platform: 'headfirst', success: false, error: result.error ?? 'Update failed' };
    }
    return { platform: 'headfirst', success: true, externalId };
  }

  async cancelEvent(externalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'cancel', externalId });
    return { success: result.success, error: result.error };
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    const result = await requestAutomation({ platform: 'headfirst', action: 'scrape' });
    if (!result.success) return [];
    const events = typeof result.data?.lastEvalResult === 'string'
      ? JSON.parse(result.data.lastEvalResult) : [];
    return events.map((e: Record<string, unknown>) => ({
      id: '',
      platform: 'headfirst' as const,
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      externalUrl: String(e.url ?? ''),
      startTime: String(e.date ?? ''),
      venue: String(e.venue ?? ''),
      syncedAt: new Date().toISOString(),
    }));
  }
}
```

- [ ] **Step 5: Write client tests**

```typescript
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
    client = new HeadfirstAutomationClient();
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
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run src/automation/headfirst.test.ts src/automation/headfirst-client.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/automation/headfirst.ts src/automation/headfirst.test.ts src/automation/headfirst-client.ts src/automation/headfirst-client.test.ts
git commit -m "feat: add Headfirst Bristol browser automation scripts and client"
```

---

## Chunk 5: Wire Bridge to Platform Scripts + Cleanup

### Task 14: Wire Platform Scripts into the Bridge Server

**Files:**
- Modify: `electron/main.ts`

Update the bridge server's `/automation/execute` handler to dispatch to the correct platform script based on the request, run the steps through the AutomationEngine, and return the result.

- [ ] **Step 1: Import platform scripts and implement dispatch**

Replace the placeholder handler in `electron/main.ts` bridge server (`req.url === '/automation/execute'` block) with the full dispatch:

```typescript
        try {
          const request = JSON.parse(body);
          const { meetupConnectSteps, meetupPublishSteps, meetupScrapeSteps } = await import('../dist/automation/meetup.js');
          const { eventbriteConnectSteps, eventbritePublishSteps, eventbriteScrapeSteps } = await import('../dist/automation/eventbrite.js');
          const { headfirstConnectSteps, headfirstPublishSteps, headfirstScrapeSteps } = await import('../dist/automation/headfirst.js');

          // Resolve the step generator for this platform + action
          type StepFn = () => AutomationStep[];
          const dispatch: Record<string, Record<string, StepFn | undefined>> = {
            meetup: {
              connect: () => meetupConnectSteps(),
              publish: () => meetupPublishSteps(request.data, request.data?.groupUrlname ?? ''),
              scrape: () => meetupScrapeSteps(request.data?.groupUrlname ?? ''),
            },
            eventbrite: {
              connect: () => eventbriteConnectSteps(),
              publish: () => eventbritePublishSteps(request.data),
              scrape: () => eventbriteScrapeSteps(),
            },
            headfirst: {
              connect: () => headfirstConnectSteps(),
              publish: () => headfirstPublishSteps(request.data),
              scrape: () => headfirstScrapeSteps(),
            },
          };

          const stepFn = dispatch[request.platform]?.[request.action];
          if (!stepFn) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: `Unsupported: ${request.platform}/${request.action}` }));
            return;
          }

          const steps = stepFn();
          const config = loadConfig();
          const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
          showAutomationView(mainWindow!, panelWidth);

          // automationEngine is a module-level AutomationEngine instance
          // initialized with the automationView's webContents
          const result = await automationEngine.run({ platform: request.platform, action: request.action, data: request.data, steps });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: String(err) }));
        }
```

- [ ] **Step 2: Ensure AutomationEngine instance is created at app startup**

Add to `app.whenReady()`, after creating the automation view:

```typescript
const { AutomationEngine } = await import('../dist/automation/engine.js');
const automationEngine = new AutomationEngine(automationView.webContents);
```

Hoist `automationEngine` to module level so the bridge handler can access it.

- [ ] **Step 3: Test end-to-end** by running the Electron app and clicking Connect on a platform
- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire platform scripts into automation bridge — end-to-end flow"
```

---

### Task 15: Remove Old OAuth/API Code

**Files:**
- Delete: `src/routes/auth.ts`
- Delete: `src/data/crypto.ts`
- Delete: `src/tools/meetup.ts` (old API client)
- Delete: `src/tools/eventbrite.ts` (old API client)
- Delete: `src/tools/headfirst.ts` (old API client)
- Delete: `railway.toml` (if exists)
- Modify: `src/app.ts` — remove any remaining auth imports
- Modify: `client/src/components/CredentialsForm.tsx` — delete if no longer used

- [ ] **Step 1: Delete the files**

```bash
rm src/routes/auth.ts src/data/crypto.ts src/tools/meetup.ts src/tools/eventbrite.ts src/tools/headfirst.ts railway.toml
```

- [ ] **Step 2: Fix any broken imports**

Run: `npx tsc --noEmit`
Fix any compilation errors from removed files.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (old API client tests are deleted, new automation tests pass)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old OAuth/API platform clients and credential encryption"
```

import type { AutomationStep, AutomationResult, AutomationStatus } from './types.js';

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
      case 'navigate': {
        if (!step.url) throw new Error('Navigate step requires url');
        const urlBefore = this.wc.getURL();
        await this.wc.loadURL(step.url);
        // Wait for the URL to actually change — loadURL resolves on navigation
        // commit, but the old page's DOM may still be present.
        await this.waitForUrlChange(urlBefore, step.url, step.timeout ?? DEFAULT_TIMEOUT);
        await this.sleep(500);
        break;
      }

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

  private async waitForUrlChange(urlBefore: string, targetUrl: string, timeout: number): Promise<void> {
    const targetBase = targetUrl.split('#')[0].replace(/\/$/, '');
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const currentUrl = this.wc.getURL();
      // Success: URL changed to target (ignoring trailing slash and hash)
      const currentBase = currentUrl.split('#')[0].replace(/\/$/, '');
      if (currentBase === targetBase) return;
      // Also succeed if URL changed from before (redirect happened)
      if (currentUrl !== urlBefore) return;
      await this.sleep(POLL_INTERVAL);
    }
    // Don't throw — the page may have redirected legitimately
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

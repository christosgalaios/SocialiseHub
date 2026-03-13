import type { PlatformClient } from './platform-client.js';
import type { SocialiseEvent, PlatformEvent, PlatformPublishResult } from '../shared/types.js';

export interface HeadfirstClientOptions {
  email: string;
  password: string;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://www.headfirstbristol.co.uk';

export class HeadfirstClient implements PlatformClient {
  readonly platform = 'headfirst' as const;
  private readonly email: string;
  private readonly password: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private sessionCookie: string | null = null;

  constructor(options: HeadfirstClientOptions) {
    this.email = options.email;
    this.password = options.password;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE;
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.ensureSession();
      return true;
    } catch {
      return false;
    }
  }

  async fetchEvents(): Promise<PlatformEvent[]> {
    await this.ensureSession();
    const res = await this.fetch(`${this.baseUrl}/my-events`, {
      headers: this.sessionHeaders(),
      redirect: 'manual',
    });
    if (!res.ok) return [];
    const html = await res.text();
    return this.parseEventsFromHtml(html);
  }

  async createEvent(event: SocialiseEvent): Promise<PlatformPublishResult> {
    await this.ensureSession();

    // Step 1: GET form page to extract CSRF token and hidden fields
    const formRes = await this.fetch(`${this.baseUrl}/submit-event`, {
      headers: this.sessionHeaders(),
    });
    if (!formRes.ok) {
      throw new Error(`Failed to load event form: ${formRes.status}`);
    }
    const formHtml = await formRes.text();
    const { csrfToken, hiddenFields } = this.extractFormFields(formHtml);

    // Step 2: POST event data
    const formData = new URLSearchParams({
      ...hiddenFields,
      _token: csrfToken,
      title: event.title,
      description: event.description,
      date: this.formatDate(event.start_time),
      time: this.formatTime(event.start_time),
      venue: event.venue,
      price: event.price > 0 ? String(event.price) : 'Free',
    });

    const submitRes = await this.fetch(`${this.baseUrl}/submit-event`, {
      method: 'POST',
      headers: {
        ...this.sessionHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // Headfirst typically redirects on success (302)
    if (submitRes.status === 302 || submitRes.status === 301 || submitRes.ok) {
      const location = submitRes.headers.get('location') ?? '';
      const externalId = this.extractEventId(location) ?? `hf-${Date.now()}`;
      return {
        platform: 'headfirst',
        success: true,
        externalId,
        externalUrl: location || undefined,
      };
    }

    const errorText = await submitRes.text();
    throw new Error(`Headfirst submission failed: ${submitRes.status} - ${errorText.slice(0, 200)}`);
  }

  async updateEvent(externalId: string, event: SocialiseEvent): Promise<PlatformPublishResult> {
    // Headfirst may not support direct editing — try the edit URL pattern
    await this.ensureSession();
    const editUrl = `${this.baseUrl}/events/${externalId}/edit`;

    const formRes = await this.fetch(editUrl, { headers: this.sessionHeaders() });
    if (!formRes.ok) {
      return { platform: 'headfirst', success: false, error: 'Edit page not accessible' };
    }
    const formHtml = await formRes.text();
    const { csrfToken, hiddenFields } = this.extractFormFields(formHtml);

    const formData = new URLSearchParams({
      ...hiddenFields,
      _token: csrfToken,
      title: event.title,
      description: event.description,
      date: this.formatDate(event.start_time),
      time: this.formatTime(event.start_time),
      venue: event.venue,
      price: event.price > 0 ? String(event.price) : 'Free',
    });

    const submitRes = await this.fetch(editUrl, {
      method: 'POST',
      headers: { ...this.sessionHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      redirect: 'manual',
    });

    if (submitRes.status === 302 || submitRes.ok) {
      return { platform: 'headfirst', success: true, externalId };
    }
    return { platform: 'headfirst', success: false, error: `Update failed: ${submitRes.status}` };
  }

  async cancelEvent(_externalId: string): Promise<{ success: boolean; error?: string }> {
    // Headfirst doesn't typically support programmatic cancellation
    return { success: false, error: 'Cancellation not supported for Headfirst — please cancel manually on the website' };
  }

  // ── Private helpers ──────────────────────────────

  private async ensureSession(): Promise<void> {
    if (this.sessionCookie) return;

    // GET login page for CSRF token
    const loginPageRes = await this.fetch(`${this.baseUrl}/login`, { redirect: 'manual' });
    const loginHtml = await loginPageRes.text();
    const { csrfToken } = this.extractFormFields(loginHtml);
    const cookies = this.extractCookies(loginPageRes);

    // POST login
    const loginRes = await this.fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
      },
      body: new URLSearchParams({
        _token: csrfToken,
        email: this.email,
        password: this.password,
      }).toString(),
      redirect: 'manual',
    });

    const sessionCookies = this.extractCookies(loginRes);
    if (!sessionCookies) {
      throw new Error('Headfirst login failed — no session cookie received');
    }
    this.sessionCookie = sessionCookies;
  }

  private sessionHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.sessionCookie) headers['Cookie'] = this.sessionCookie;
    return headers;
  }

  private extractCookies(res: Response): string {
    const setCookie = res.headers.getSetCookie?.() ?? [];
    return setCookie.map((c) => c.split(';')[0]).join('; ');
  }

  extractFormFields(html: string): { csrfToken: string; hiddenFields: Record<string, string> } {
    const csrfMatch = html.match(/name="_token"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch?.[1] ?? '';

    const hiddenFields: Record<string, string> = {};
    const hiddenRegex = /<input[^>]+type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g;
    let match;
    while ((match = hiddenRegex.exec(html)) !== null) {
      if (match[1] !== '_token') {
        hiddenFields[match[1]] = match[2];
      }
    }
    return { csrfToken, hiddenFields };
  }

  private parseEventsFromHtml(html: string): PlatformEvent[] {
    const events: PlatformEvent[] = [];
    // Simple regex-based parsing for event cards
    const eventRegex = /<a[^>]+href="([^"]*\/events\/([^"]+))"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)/g;
    let match;
    while ((match = eventRegex.exec(html)) !== null) {
      events.push({
        id: '',
        platform: 'headfirst',
        externalId: match[2],
        externalUrl: match[1].startsWith('http') ? match[1] : `${this.baseUrl}${match[1]}`,
        title: match[3].trim(),
        status: 'active',
        syncedAt: new Date().toISOString(),
      });
    }
    return events;
  }

  private extractEventId(url: string): string | undefined {
    const match = url.match(/\/events\/([^/?]+)/);
    return match?.[1];
  }

  private formatDate(isoDateTime: string): string {
    const d = new Date(isoDateTime);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private formatTime(isoDateTime: string): string {
    const d = new Date(isoDateTime);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { SqliteServiceStore } from '../data/sqlite-service-store.js';
import type { PlatformName } from '../shared/types.js';
import { VALID_PLATFORMS } from '../shared/types.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── OAuth config per platform ───────────────────────────

interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes?: string[];
}

const OAUTH_CONFIGS: Partial<Record<PlatformName, OAuthConfig>> = {
  meetup: {
    authorizeUrl: 'https://secure.meetup.com/oauth2/authorize',
    tokenUrl: 'https://secure.meetup.com/oauth2/access',
    clientIdEnv: 'MEETUP_CLIENT_ID',
    clientSecretEnv: 'MEETUP_CLIENT_SECRET',
    scopes: ['event_management'],
  },
  eventbrite: {
    authorizeUrl: 'https://www.eventbrite.com/oauth/authorize',
    tokenUrl: 'https://www.eventbrite.com/oauth/token',
    clientIdEnv: 'EVENTBRITE_CLIENT_ID',
    clientSecretEnv: 'EVENTBRITE_CLIENT_SECRET',
  },
  // Headfirst has no OAuth — uses credential form
};

// In-memory store for OAuth state tokens (CSRF protection)
const pendingStates = new Map<string, { platform: PlatformName; createdAt: number }>();

// Clean up stale states every 5 minutes
setInterval(() => {
  const fiveMin = 5 * 60 * 1000;
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now - val.createdAt > fiveMin) pendingStates.delete(key);
  }
}, 60_000);

// ── Router ──────────────────────────────────────────────

export function createAuthRouter(serviceStore: SqliteServiceStore, port: number): Router {
  const router = Router();

  /**
   * POST /auth/:platform/start
   * Returns { authUrl } for the frontend to open in the browser.
   */
  router.post('/:platform/start', (req, res) => {
    const platform = req.params.platform as PlatformName;
    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const config = OAUTH_CONFIGS[platform];
    if (!config) {
      return res.status(400).json({ error: `${platform} does not support OAuth` });
    }

    const clientId = process.env[config.clientIdEnv];
    if (!clientId) {
      return res.status(500).json({
        error: `${config.clientIdEnv} environment variable not set`,
      });
    }

    // Generate state token for CSRF protection
    const state = randomUUID();
    pendingStates.set(state, { platform, createdAt: Date.now() });

    const redirectUri = `http://localhost:${port}/auth/callback/${platform}`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    if (config.scopes?.length) {
      params.set('scope', config.scopes.join(' '));
    }

    const authUrl = `${config.authorizeUrl}?${params.toString()}`;
    res.json({ authUrl });
  });

  /**
   * GET /auth/callback/:platform
   * OAuth callback — platform redirects here after user grants access.
   * Exchanges code for token, stores it, and shows a success page.
   */
  router.get('/callback/:platform', async (req, res) => {
    const platform = req.params.platform as PlatformName;
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    // Handle OAuth errors
    if (oauthError) {
      return res.send(errorPage(`OAuth error: ${oauthError}. You can close this tab.`));
    }

    // Validate state
    if (!state || !pendingStates.has(state)) {
      return res.send(errorPage('Invalid or expired state token. Please try connecting again.'));
    }
    const stateData = pendingStates.get(state)!;
    pendingStates.delete(state);

    if (stateData.platform !== platform) {
      return res.send(errorPage('Platform mismatch. Please try connecting again.'));
    }

    if (!code) {
      return res.send(errorPage('No authorization code received. Please try again.'));
    }

    const config = OAUTH_CONFIGS[platform];
    if (!config) {
      return res.send(errorPage('Platform does not support OAuth.'));
    }

    // Exchange code for token
    try {
      const clientId = process.env[config.clientIdEnv] ?? '';
      const clientSecret = process.env[config.clientSecretEnv] ?? '';
      const redirectUri = `http://localhost:${port}/auth/callback/${platform}`;

      const tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error(`OAuth token exchange failed for ${platform}:`, body);
        return res.send(errorPage('Failed to exchange authorization code. Please try again.'));
      }

      const tokenData = await tokenRes.json() as Record<string, unknown>;
      const accessToken = (tokenData.access_token ?? tokenData.token) as string;
      const refreshToken = tokenData.refresh_token as string | undefined;

      // Store the token in ServiceStore
      const credentials: Record<string, string> = { access_token: accessToken };
      if (refreshToken) credentials.refresh_token = refreshToken;
      if (tokenData.expires_in) {
        const expiresAt = Date.now() + Number(tokenData.expires_in) * 1000;
        credentials.token_expires_at = String(expiresAt);
      }

      serviceStore.connect(platform, credentials);

      return res.send(successPage(platform));
    } catch (err) {
      console.error(`OAuth callback error for ${platform}:`, err);
      return res.send(errorPage('An error occurred during authentication. Please try again.'));
    }
  });

  /**
   * GET /auth/:platform/status
   * SSE endpoint — frontend polls this to detect when OAuth completes.
   */
  router.get('/:platform/status', async (req, res) => {
    const platform = req.params.platform as PlatformName;
    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Check every second for up to 5 minutes
    let checks = 0;
    const maxChecks = 300;
    const interval = setInterval(() => {
      checks++;
      try {
        const svc = serviceStore.getService(platform);
        if (svc?.connected) {
          res.write(`data: ${JSON.stringify({ connected: true, platform })}\n\n`);
          clearInterval(interval);
          res.end();
        } else if (checks >= maxChecks) {
          res.write(`data: ${JSON.stringify({ connected: false, timeout: true })}\n\n`);
          clearInterval(interval);
          res.end();
        }
      } catch {
        clearInterval(interval);
        res.end();
      }
    }, 1000);

    req.on('close', () => clearInterval(interval));
  });

  return router;
}

// ── HTML pages for the OAuth callback ───────────────────

function successPage(platform: string): string {
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  return `<!DOCTYPE html>
<html><head>
  <title>Connected — SocialiseHub</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; background: #FAFAF6; margin: 0; }
    .card { text-align: center; background: #fff; border-radius: 20px; padding: 48px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06); max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #080810; margin: 0 0 8px; }
    p { font-size: 14px; color: #7a7a7a; margin: 0; }
    .brand { color: #E2725B; font-weight: 700; }
  </style>
</head><body>
  <div class="card">
    <div class="icon">✅</div>
    <h1><span class="brand">${platformLabel}</span> Connected!</h1>
    <p>You can close this tab and return to SocialiseHub.</p>
  </div>
</body></html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html><head>
  <title>Error — SocialiseHub</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; background: #FAFAF6; margin: 0; }
    .card { text-align: center; background: #fff; border-radius: 20px; padding: 48px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06); max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #080810; margin: 0 0 8px; }
    p { font-size: 14px; color: #E2725B; margin: 0; }
  </style>
</head><body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Connection Failed</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body></html>`;
}

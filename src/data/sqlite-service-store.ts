import type { Database } from './database.js';
import type { PlatformName, ServiceConnection } from '../shared/types.js';

const LABELS: Record<PlatformName, { label: string; description: string }> = {
  meetup: { label: 'Meetup', description: 'Publish events to Meetup.com groups' },
  eventbrite: { label: 'Eventbrite', description: 'List events on Eventbrite for ticket sales' },
  headfirst: { label: 'Headfirst Bristol', description: "List events on Bristol's what's on guide" },
};

interface ServiceRow {
  platform: string;
  connected: number;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  extra: string | null;
  connected_at: string | null;
}

export type FullServiceConnection = ServiceConnection & {
  credentials?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export class SqliteServiceStore {
  constructor(private readonly db: Database) {}

  getAll(): ServiceConnection[] {
    const rows = this.db
      .prepare('SELECT platform, connected, connected_at FROM services ORDER BY platform')
      .all() as Pick<ServiceRow, 'platform' | 'connected' | 'connected_at'>[];

    return rows.map((row) => {
      const platform = row.platform as PlatformName;
      const meta = LABELS[platform] ?? { label: platform, description: '' };
      return {
        platform,
        connected: row.connected === 1,
        label: meta.label,
        description: meta.description,
        ...(row.connected_at ? { connectedAt: row.connected_at } : {}),
      };
    });
  }

  getService(platform: PlatformName): FullServiceConnection | undefined {
    const row = this.db
      .prepare('SELECT * FROM services WHERE platform = ?')
      .get(platform) as ServiceRow | undefined;

    if (!row) return undefined;

    const meta = LABELS[platform] ?? { label: platform, description: '' };

    const credentials: Record<string, string> = {};
    if (row.access_token) credentials['access_token'] = row.access_token;
    if (row.refresh_token) credentials['refresh_token'] = row.refresh_token;
    if (row.token_expires_at) credentials['token_expires_at'] = row.token_expires_at;

    let extra: Record<string, unknown> | undefined;
    if (row.extra) {
      try { extra = JSON.parse(row.extra) as Record<string, unknown>; } catch { extra = undefined; }
    }

    return {
      platform,
      connected: row.connected === 1,
      label: meta.label,
      description: meta.description,
      ...(row.connected_at ? { connectedAt: row.connected_at } : {}),
      ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
      ...(extra ? { extra } : {}),
    };
  }

  connect(
    platform: PlatformName,
    credentials: Record<string, string>,
  ): ServiceConnection | undefined {
    const existing = this.db
      .prepare('SELECT platform FROM services WHERE platform = ?')
      .get(platform) as { platform: string } | undefined;

    if (!existing) return undefined;

    const connectedAt = new Date().toISOString();
    const accessToken = credentials['access_token'] ?? null;
    const refreshToken = credentials['refresh_token'] ?? null;
    const tokenExpiresAt = credentials['token_expires_at'] ?? null;

    this.db
      .prepare(
        `UPDATE services
         SET connected = 1,
             access_token = ?,
             refresh_token = ?,
             token_expires_at = ?,
             connected_at = ?
         WHERE platform = ?`,
      )
      .run(accessToken, refreshToken, tokenExpiresAt, connectedAt, platform);

    const meta = LABELS[platform] ?? { label: platform, description: '' };
    return {
      platform,
      connected: true,
      label: meta.label,
      description: meta.description,
      connectedAt,
    };
  }

  disconnect(platform: PlatformName): ServiceConnection | undefined {
    const existing = this.db
      .prepare('SELECT platform FROM services WHERE platform = ?')
      .get(platform) as { platform: string } | undefined;

    if (!existing) return undefined;

    this.db
      .prepare(
        `UPDATE services
         SET connected = 0,
             access_token = NULL,
             refresh_token = NULL,
             token_expires_at = NULL,
             connected_at = NULL
         WHERE platform = ?`,
      )
      .run(platform);

    const meta = LABELS[platform] ?? { label: platform, description: '' };
    return {
      platform,
      connected: false,
      label: meta.label,
      description: meta.description,
    };
  }

  updateExtra(platform: PlatformName, extra: Record<string, unknown>): void {
    this.db
      .prepare('UPDATE services SET extra = ? WHERE platform = ?')
      .run(JSON.stringify(extra), platform);
  }

  updateTokens(
    platform: PlatformName,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: string,
  ): void {
    this.db
      .prepare(
        `UPDATE services
         SET access_token = ?,
             refresh_token = ?,
             token_expires_at = ?
         WHERE platform = ?`,
      )
      .run(
        accessToken,
        refreshToken ?? null,
        expiresAt ?? null,
        platform,
      );
  }
}

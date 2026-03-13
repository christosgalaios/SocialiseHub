import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { SqliteServiceStore } from './sqlite-service-store.js';
import { decrypt } from './crypto.js';

describe('SqliteServiceStore', () => {
  let db: Database;
  let store: SqliteServiceStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new SqliteServiceStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('lists all services without credentials', () => {
    const services = store.getAll();
    expect(services).toHaveLength(3);

    const platforms = services.map((s) => s.platform).sort();
    expect(platforms).toEqual(['eventbrite', 'headfirst', 'meetup']);

    for (const svc of services) {
      expect(svc.connected).toBe(false);
      expect(svc.label).toBeTruthy();
      expect(svc.description).toBeTruthy();
      // credentials must NOT be present on the public list
      expect((svc as Record<string, unknown>)['credentials']).toBeUndefined();
    }
  });

  it('connects a service with encrypted credentials (DB value is encrypted)', () => {
    const result = store.connect('meetup', {
      access_token: 'plaintext-token-abc',
      refresh_token: 'plaintext-refresh-xyz',
    });

    expect(result).toBeDefined();
    expect(result!.connected).toBe(true);
    expect(result!.platform).toBe('meetup');
    // returned object should not carry raw credentials
    expect((result as Record<string, unknown>)['credentials']).toBeUndefined();

    // Verify the DB row has an encrypted (not plaintext) value
    const row = db
      .prepare('SELECT access_token, refresh_token FROM services WHERE platform = ?')
      .get('meetup') as { access_token: string; refresh_token: string };

    expect(row.access_token).not.toBe('plaintext-token-abc');
    expect(row.refresh_token).not.toBe('plaintext-refresh-xyz');

    // Confirm it can be decrypted back
    expect(decrypt(row.access_token)).toBe('plaintext-token-abc');
    expect(decrypt(row.refresh_token)).toBe('plaintext-refresh-xyz');
  });

  it('disconnects a service and clears credentials', () => {
    // First connect
    store.connect('eventbrite', { access_token: 'token-123' });

    // Then disconnect
    const result = store.disconnect('eventbrite');
    expect(result).toBeDefined();
    expect(result!.connected).toBe(false);

    // Verify DB row is cleared
    const row = db
      .prepare('SELECT connected, access_token, refresh_token, connected_at FROM services WHERE platform = ?')
      .get('eventbrite') as {
        connected: number;
        access_token: string | null;
        refresh_token: string | null;
        connected_at: string | null;
      };

    expect(row.connected).toBe(0);
    expect(row.access_token).toBeNull();
    expect(row.refresh_token).toBeNull();
    expect(row.connected_at).toBeNull();
  });

  it('getService returns decrypted credentials for internal use', () => {
    store.connect('headfirst', {
      access_token: 'secret-headfirst-key',
      refresh_token: 'secret-headfirst-refresh',
    });

    const svc = store.getService('headfirst');
    expect(svc).toBeDefined();
    expect(svc!.connected).toBe(true);
    expect(svc!.credentials).toBeDefined();
    expect(svc!.credentials!['access_token']).toBe('secret-headfirst-key');
    expect(svc!.credentials!['refresh_token']).toBe('secret-headfirst-refresh');
  });

  it('returns undefined for an invalid platform', () => {
    const result = store.getService('nonexistent' as 'meetup');
    expect(result).toBeUndefined();

    const connectResult = store.connect('nonexistent' as 'meetup', { access_token: 'x' });
    expect(connectResult).toBeUndefined();

    const disconnectResult = store.disconnect('nonexistent' as 'meetup');
    expect(disconnectResult).toBeUndefined();
  });
});

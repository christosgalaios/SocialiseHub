import BetterSqlite3 from 'better-sqlite3';

export type Database = BetterSqlite3.Database;

export function createDatabase(path: string): Database {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_minutes INTEGER DEFAULT 120,
      venue TEXT,
      price REAL DEFAULT 0,
      capacity INTEGER,
      image_url TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY,
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      external_url TEXT,
      title TEXT,
      date TEXT,
      venue TEXT,
      status TEXT DEFAULT 'active',
      raw_data TEXT,
      synced_at TEXT NOT NULL,
      published_at TEXT,
      UNIQUE(platform, external_id)
    );

    CREATE TABLE IF NOT EXISTS services (
      platform TEXT PRIMARY KEY,
      connected INTEGER DEFAULT 0,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT,
      extra TEXT,
      connected_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      action TEXT NOT NULL,
      event_id TEXT,
      external_id TEXT,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO services (platform, connected) VALUES ('meetup', 0);
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('eventbrite', 0);
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('headfirst', 0);
  `);
}

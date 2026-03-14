import BetterSqlite3 from 'better-sqlite3';

export type Database = BetterSqlite3.Database;

export function createDatabase(path: string): Database {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  runMigrations(db);
  return db;
}

function runMigrations(db: Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion < 1) {
    try {
      db.exec("ALTER TABLE events ADD COLUMN sync_status TEXT DEFAULT 'local_only'");
    } catch {
      // Column already exists
    }
    db.pragma('user_version = 1');
  }
  if (currentVersion < 2) {
    db.exec(`CREATE TABLE IF NOT EXISTS market_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT,
      venue TEXT,
      category TEXT,
      price TEXT,
      url TEXT,
      scraped_at TEXT NOT NULL,
      UNIQUE(platform, external_id)
    )`);
    db.pragma('user_version = 2');
  }
  if (currentVersion < 3) {
    const alterCols = [
      'ALTER TABLE platform_events ADD COLUMN attendance INTEGER',
      'ALTER TABLE platform_events ADD COLUMN capacity INTEGER',
      'ALTER TABLE platform_events ADD COLUMN revenue REAL',
      'ALTER TABLE platform_events ADD COLUMN ticket_price REAL',
    ];
    for (const sql of alterCols) {
      try { db.exec(sql); } catch { /* column exists */ }
    }
    db.pragma('user_version = 3');
  }
  if (currentVersion < 4) {
    db.exec(`CREATE TABLE IF NOT EXISTS event_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS event_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      source TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_cover INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.pragma('user_version = 4');
  }
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

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      venue TEXT,
      duration_minutes INTEGER DEFAULT 120,
      price REAL DEFAULT 0,
      capacity INTEGER,
      image_url TEXT,
      platforms TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO services (platform, connected) VALUES ('meetup', 0);
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('eventbrite', 0);
    INSERT OR IGNORE INTO services (platform, connected) VALUES ('headfirst', 0);
  `);
}

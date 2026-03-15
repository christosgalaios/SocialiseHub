import BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'crypto';

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
  if (currentVersion < 5) {
    db.exec(`CREATE TABLE IF NOT EXISTS event_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      short_description TEXT,
      category TEXT,
      suggested_date TEXT,
      date_reason TEXT,
      confidence TEXT DEFAULT 'medium',
      used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS event_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      overall INTEGER NOT NULL,
      breakdown_json TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      scored_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.pragma('user_version = 5');
  }
  if (currentVersion < 6) {
    // Link all unlinked platform_events to events table
    // This fixes events synced before linkPlatformEventToEvent was added
    const unlinked = db.prepare(
      'SELECT id, platform, external_id, title, date, venue FROM platform_events WHERE event_id IS NULL'
    ).all() as Array<{ id: string; platform: string; external_id: string; title: string; date: string; venue: string }>;

    const insertEvent = db.prepare(
      `INSERT INTO events (id, title, description, start_time, end_time, duration_minutes, venue, price, capacity, status, sync_status, created_at, updated_at)
       VALUES (?, ?, '', ?, NULL, 120, ?, 0, 0, 'draft', 'synced', ?, ?)`
    );
    const linkPe = db.prepare('UPDATE platform_events SET event_id = ? WHERE id = ?');

    const migrate = db.transaction(() => {
      for (const pe of unlinked) {
        const eventId = randomUUID();
        const now = new Date().toISOString();
        // Use date if valid, otherwise use now
        let startTime = now;
        if (pe.date && pe.date.length > 0) {
          try { startTime = new Date(pe.date).toISOString(); } catch { /* use now */ }
        }
        insertEvent.run(eventId, pe.title, startTime, pe.venue || '', now, now);
        linkPe.run(eventId, pe.id);
      }
    });
    migrate();

    db.pragma('user_version = 6');
  }
  if (currentVersion < 7) {
    db.exec(`CREATE TABLE IF NOT EXISTS dashboard_suggestions (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      suggestions_json TEXT NOT NULL,
      generated_at TEXT NOT NULL
    )`);
    db.pragma('user_version = 7');
  }
  if (currentVersion < 8) {
    try { db.exec('ALTER TABLE platform_events ADD COLUMN description TEXT'); } catch { /* exists */ }
    try { db.exec('ALTER TABLE platform_events ADD COLUMN image_urls TEXT'); } catch { /* exists */ }
    db.exec(`CREATE TABLE IF NOT EXISTS event_sync_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      title TEXT,
      description TEXT,
      start_time TEXT,
      venue TEXT,
      price REAL,
      capacity INTEGER,
      photos_json TEXT,
      snapshot_hash TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(event_id, platform),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.pragma('user_version = 8');
  }
  if (currentVersion < 9) {
    try { db.exec('ALTER TABLE events ADD COLUMN category TEXT'); } catch { /* exists */ }
    db.pragma('user_version = 9');
  }
  if (currentVersion < 10) {
    db.exec(`CREATE TABLE IF NOT EXISTS event_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT DEFAULT 'manager',
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.pragma('user_version = 10');
  }
  if (currentVersion < 11) {
    db.exec(`CREATE TABLE IF NOT EXISTS event_tags (
      event_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      UNIQUE(event_id, tag)
    )`);
    db.pragma('user_version = 11');
  }
  if (currentVersion < 12) {
    db.exec(`CREATE TABLE IF NOT EXISTS event_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      label TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`);
    db.pragma('user_version = 12');
  }
  if (currentVersion < 13) {
    try { db.exec('ALTER TABLE events ADD COLUMN actual_attendance INTEGER'); } catch { /* exists */ }
    try { db.exec('ALTER TABLE events ADD COLUMN actual_revenue REAL'); } catch { /* exists */ }
    db.pragma('user_version = 13');
  }
  if (currentVersion < 14) {
    // Add indexes on foreign key columns for faster lookups and cascade deletes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_platform_events_event_id ON platform_events(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_photos_event_id ON event_photos(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_scores_event_id ON event_scores(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_notes_event_id ON event_notes(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_tags_event_id ON event_tags(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_checklist_event_id ON event_checklist(event_id);
      CREATE INDEX IF NOT EXISTS idx_sync_log_event_id ON sync_log(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_sync_snapshots_event_id ON event_sync_snapshots(event_id);
      CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    `);
    db.pragma('user_version = 14');
  }
  if (currentVersion < 15) {
    const newCols = [
      "ALTER TABLE events ADD COLUMN short_description TEXT",
      "ALTER TABLE events ADD COLUMN doors_open_time TEXT",
      "ALTER TABLE events ADD COLUMN age_restriction TEXT",
      "ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'in_person'",
      "ALTER TABLE events ADD COLUMN online_url TEXT",
      "ALTER TABLE events ADD COLUMN parking_info TEXT",
      "ALTER TABLE events ADD COLUMN refund_policy TEXT",
      "ALTER TABLE events ADD COLUMN allow_guests INTEGER",
      "ALTER TABLE events ADD COLUMN rsvp_open TEXT",
      "ALTER TABLE events ADD COLUMN rsvp_close TEXT",
    ];
    for (const sql of newCols) {
      try { db.exec(sql); } catch { /* column exists */ }
    }
    db.pragma('user_version = 15');
  }
  if (currentVersion < 16) {
    try { db.exec("ALTER TABLE platform_events ADD COLUMN organizer_name TEXT"); } catch { /* column exists */ }
    try { db.exec("ALTER TABLE events ADD COLUMN organizer_name TEXT"); } catch { /* column exists */ }
    db.pragma('user_version = 16');
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
      category TEXT,
      status TEXT DEFAULT 'draft',
      sync_status TEXT DEFAULT 'local_only',
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

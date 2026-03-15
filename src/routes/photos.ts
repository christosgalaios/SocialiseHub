import { Router } from 'express';
import { mkdirSync, unlinkSync, existsSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import type { Database } from '../data/database.js';

const DATA_DIR = join(process.cwd(), 'data');

interface PhotoRow {
  id: number;
  event_id: string;
  photo_path: string;
  source: string;
  position: number;
  is_cover: number;
}

export function createPhotosRouter(db: Database): Router {
  const router = Router();

  // Multer storage — saves to data/photos/{eventId}/
  const storage = multer.diskStorage({
    destination(req, _file, cb) {
      const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const dir = join(process.cwd(), 'data', 'photos', eventId);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const ts = Date.now();
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${ts}_${safe}`);
    },
  });

  const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

  /**
   * GET /api/events/:id/photos
   * List photos for an event, ordered by position.
   */
  router.get('/:id/photos', (req, res, next) => {
    try {
      const photos = db.prepare<[string], PhotoRow>(
        'SELECT * FROM event_photos WHERE event_id = ? ORDER BY position ASC'
      ).all(req.params.id);

      res.json({ data: photos.map(photoToDto) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/photos
   * Upload a photo (multipart, field name 'photo').
   */
  router.post('/:id/photos', upload.single('photo'), (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const eventId = req.params.id as string;
      const source = (req.body as { source?: string }).source ?? 'upload';
      const relativePath = `/data/photos/${eventId}/${req.file.filename}`;

      // Determine next position
      const maxRow = db.prepare<[string], { max_pos: number | null }>(
        'SELECT MAX(position) as max_pos FROM event_photos WHERE event_id = ?'
      ).get(eventId);
      const nextPos = (maxRow?.max_pos ?? -1) + 1;

      const result = db.prepare(
        `INSERT INTO event_photos (event_id, photo_path, source, position, is_cover)
         VALUES (?, ?, ?, ?, ?)`
      ).run(eventId, relativePath, source, nextPos, nextPos === 0 ? 1 : 0);

      const photo = db.prepare<[number], PhotoRow>(
        'SELECT * FROM event_photos WHERE id = ?'
      ).get(result.lastInsertRowid as number);

      if (!photo) return res.status(500).json({ error: 'Failed to read back inserted photo' });
      res.status(201).json({ data: photoToDto(photo) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/events/:id/photos/reorder
   * Takes { order: number[] } array of photo IDs in new order.
   */
  router.patch('/:id/photos/reorder', (req, res, next) => {
    try {
      const { order } = req.body as { order?: number[] };
      if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of photo IDs' });

      const updatePos = db.prepare('UPDATE event_photos SET position = ?, is_cover = ? WHERE id = ? AND event_id = ?');
      const reorder = db.transaction(() => {
        for (let i = 0; i < order.length; i++) {
          updatePos.run(i, i === 0 ? 1 : 0, order[i], req.params.id);
        }
      });
      reorder();

      const photos = db.prepare<[string], PhotoRow>(
        'SELECT * FROM event_photos WHERE event_id = ? ORDER BY position ASC'
      ).all(req.params.id);

      res.json({ data: photos.map(photoToDto) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/photos/auto
   * Auto-fetches 4 landscape photos from Unsplash based on event title/description keywords,
   * downloads them to data/photos/{eventId}/, and creates event_photos rows.
   * Returns { photos: [...] }.
   */
  router.post('/:id/photos/auto', async (req, res, next) => {
    try {
      const eventId = req.params.id;

      // Load event title + description from DB
      const eventRow = db.prepare<[string], { title: string; description: string | null }>(
        'SELECT title, description FROM events WHERE id = ?'
      ).get(eventId);
      if (!eventRow) return res.status(404).json({ error: 'Event not found' });

      const accessKey = process.env.UNSPLASH_ACCESS_KEY;
      if (!accessKey) return res.status(503).json({ error: 'UNSPLASH_ACCESS_KEY not configured' });

      // Build search query from event title (first 5 words) for best relevance
      const keywords = eventRow.title.split(/\s+/).slice(0, 5).join(' ');
      const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keywords)}&per_page=4&orientation=landscape`;

      const searchResp = await fetch(searchUrl, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      });
      if (!searchResp.ok) {
        const text = await searchResp.text();
        return res.status(searchResp.status).json({ error: `Unsplash error: ${text}` });
      }

      const searchData = await searchResp.json() as {
        results: Array<{
          id: string;
          urls: { regular: string };
          alt_description: string | null;
          user: { name: string };
        }>;
      };

      if (searchData.results.length === 0) {
        return res.status(404).json({ error: 'No photos found for this event' });
      }

      // Ensure output directory exists
      const photoDir = join(DATA_DIR, 'photos', eventId);
      mkdirSync(photoDir, { recursive: true });

      // Determine starting position
      const maxRow = db.prepare<[string], { max_pos: number | null }>(
        'SELECT MAX(position) as max_pos FROM event_photos WHERE event_id = ?'
      ).get(eventId);
      let nextPos = (maxRow?.max_pos ?? -1) + 1;

      const insertStmt = db.prepare(
        `INSERT INTO event_photos (event_id, photo_path, source, position, is_cover)
         VALUES (?, ?, ?, ?, ?)`
      );

      const createdPhotos: ReturnType<typeof photoToDto>[] = [];

      for (const result of searchData.results) {
        const filename = `${Date.now()}_unsplash_${result.id}.jpg`;
        const filePath = join(photoDir, filename);
        const relativePath = `/data/photos/${eventId}/${filename}`;

        // Download photo to disk
        const dlResp = await fetch(result.urls.regular);
        if (!dlResp.ok || !dlResp.body) continue;

        await pipeline(
          // Node 18+ supports ReadableStream → Readable conversion via stream.Readable.fromWeb
          // but we use the simpler approach: collect body as buffer
          (async function* () {
            const reader = dlResp.body!.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              yield Buffer.from(value);
            }
          })(),
          createWriteStream(filePath),
        );

        const isCover = nextPos === 0 ? 1 : 0;
        const dbResult = insertStmt.run(eventId, relativePath, 'unsplash', nextPos, isCover);

        const photoRow = db.prepare<[number], PhotoRow>(
          'SELECT * FROM event_photos WHERE id = ?'
        ).get(dbResult.lastInsertRowid as number);

        if (photoRow) createdPhotos.push(photoToDto(photoRow));
        nextPos++;
      }

      res.status(201).json({ photos: createdPhotos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/events/:id/photos/:photoId
   * Deletes the DB record and the file on disk.
   */
  router.delete('/:id/photos/:photoId', (req, res, next) => {
    try {
      const photoId = Number(req.params.photoId);
      if (Number.isNaN(photoId)) return res.status(400).json({ error: 'Invalid photo ID' });

      const photo = db.prepare<[number, string], PhotoRow>(
        'SELECT * FROM event_photos WHERE id = ? AND event_id = ?'
      ).get(photoId, req.params.id);

      if (!photo) return res.status(404).json({ error: 'Photo not found' });

      // Delete file from disk (with path traversal protection)
      const filePath = resolve(process.cwd(), photo.photo_path.replace(/^\//, ''));
      const safeBase = resolve(process.cwd(), 'data');
      if (!filePath.startsWith(safeBase)) {
        // Path resolves outside data directory — skip file deletion but still remove DB record
        console.warn(`Photo path escapes data directory, skipping file delete: ${photo.photo_path}`);
      } else if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch (err) {
          console.warn(`Failed to delete photo file ${filePath}:`, err);
        }
      }

      db.prepare('DELETE FROM event_photos WHERE id = ?').run(photo.id);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function photoToDto(row: PhotoRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    url: row.photo_path,
    source: row.source,
    position: row.position,
    isCover: row.is_cover === 1,
  };
}

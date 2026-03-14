import { Router } from 'express';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import multer from 'multer';
import type { Database } from '../data/database.js';

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

      res.status(201).json({ data: photoToDto(photo!) });
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
   * DELETE /api/events/:id/photos/:photoId
   * Deletes the DB record and the file on disk.
   */
  router.delete('/:id/photos/:photoId', (req, res, next) => {
    try {
      const photo = db.prepare<[number, string], PhotoRow>(
        'SELECT * FROM event_photos WHERE id = ? AND event_id = ?'
      ).get(Number(req.params.photoId), req.params.id);

      if (!photo) return res.status(404).json({ error: 'Photo not found' });

      // Delete file from disk
      const filePath = join(process.cwd(), photo.photo_path.replace(/^\/data\//, 'data/'));
      if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch { /* ignore fs errors */ }
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

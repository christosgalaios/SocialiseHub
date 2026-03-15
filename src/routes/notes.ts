import { Router } from 'express';
import type { Database } from '../data/database.js';

interface NoteRow {
  id: number;
  event_id: string;
  content: string;
  author: string;
  created_at: string;
}

export function createNotesRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /api/events/:id/notes
   * List all notes for an event, newest first.
   */
  router.get('/:id/notes', (req, res, next) => {
    try {
      const notes = db.prepare<[string], NoteRow>(
        'SELECT * FROM event_notes WHERE event_id = ? ORDER BY created_at DESC'
      ).all(req.params.id);

      res.json({
        data: notes.map(noteToDto),
        total: notes.length,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/notes
   * Add a note to an event.
   */
  router.post('/:id/notes', (req, res, next) => {
    try {
      const { content, author } = req.body as { content?: string; author?: string };

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'content is required and must be non-empty' });
      }

      if (content.length > 5000) {
        return res.status(400).json({ error: 'content must be 5000 characters or less' });
      }

      const safeAuthor = typeof author === 'string' ? author.trim().slice(0, 100) : 'manager';

      const now = new Date().toISOString();
      const result = db.prepare(
        'INSERT INTO event_notes (event_id, content, author, created_at) VALUES (?, ?, ?, ?)'
      ).run(req.params.id, content.trim(), safeAuthor || 'manager', now);

      const note = db.prepare<[number], NoteRow>(
        'SELECT * FROM event_notes WHERE id = ?'
      ).get(result.lastInsertRowid as number);

      if (!note) return res.status(500).json({ error: 'Failed to read back note' });
      res.status(201).json({ data: noteToDto(note) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/events/:id/notes/:noteId
   * Delete a specific note.
   */
  router.delete('/:id/notes/:noteId', (req, res, next) => {
    try {
      const noteId = Number(req.params.noteId);
      if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

      const result = db.prepare(
        'DELETE FROM event_notes WHERE id = ? AND event_id = ?'
      ).run(noteId, req.params.id);

      if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function noteToDto(row: NoteRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    content: row.content,
    author: row.author,
    createdAt: row.created_at,
  };
}

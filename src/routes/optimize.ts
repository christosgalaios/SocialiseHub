import { Router } from 'express';
import { existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Database } from '../data/database.js';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { SocialiseEvent } from '../shared/types.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function createOptimizeRouter(db: Database, eventStore: SqliteEventStore): Router {
  const router = Router();

  /**
   * POST /api/events/:id/optimize
   * Saves a snapshot of the event and returns an SEO optimization prompt.
   */
  router.post('/:id/optimize', async (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      // Upsert snapshot
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO event_snapshots (event_id, snapshot_json, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, created_at = excluded.created_at
      `).run(req.params.id, JSON.stringify(event), now);

      const prompt = composeOptimizePrompt(event);
      res.json({ prompt, eventId: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/optimize/undo
   * Restores text fields (title, description) from the saved snapshot.
   */
  router.post('/:id/optimize/undo', async (req, res, next) => {
    try {
      const row = db.prepare<[string], { snapshot_json: string }>(
        'SELECT snapshot_json FROM event_snapshots WHERE event_id = ?'
      ).get(req.params.id);

      if (!row) return res.status(404).json({ error: 'No snapshot found for this event' });

      const snapshot = JSON.parse(row.snapshot_json) as SocialiseEvent;
      const updated = eventStore.update(req.params.id, {
        title: snapshot.title,
        description: snapshot.description,
      });

      if (!updated) return res.status(404).json({ error: 'Event not found' });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/optimize/photos/search
   * Searches Unsplash for photos related to the event.
   */
  router.post('/:id/optimize/photos/search', async (req, res, next) => {
    try {
      const { query } = req.body as { query?: string };
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const accessKey = process.env.UNSPLASH_ACCESS_KEY;
      if (!accessKey) {
        return res.status(503).json({ error: 'UNSPLASH_ACCESS_KEY not configured' });
      }

      const searchQuery = query || event.title;
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=12&orientation=landscape`;
      const response = await fetch(url, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Unsplash error: ${text}` });
      }

      const data = await response.json() as {
        results: Array<{
          id: string;
          urls: { regular: string; thumb: string };
          alt_description: string | null;
          user: { name: string };
        }>;
      };

      const photos = data.results.map((r) => ({
        id: r.id,
        url: r.urls.regular,
        thumbUrl: r.urls.thumb,
        alt: r.alt_description ?? searchQuery,
        photographer: r.user.name,
      }));

      res.json({ photos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/optimize/photos/local
   * Lists image files from a local folder.
   */
  router.post('/:id/optimize/photos/local', async (req, res, next) => {
    try {
      const { folderPath } = req.body as { folderPath?: string };
      if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
      if (!existsSync(folderPath)) return res.status(404).json({ error: 'Folder not found' });

      const files = readdirSync(folderPath)
        .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
        .map((f) => ({
          name: f,
          path: join(folderPath, f),
        }));

      res.json({ files });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/events/:id/optimize/photos/generate-prompt
   * Returns an AI image generation prompt tailored to the event.
   */
  router.post('/:id/optimize/photos/generate-prompt', async (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const prompt = composeImageGenPrompt(event);
      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── Prompt helpers ─────────────────────────────────────

function composeOptimizePrompt(event: SocialiseEvent): string {
  const today = new Date().toISOString().split('T')[0];
  return `You are an SEO and event marketing specialist for **Socialise**, a social events company in Bristol, UK. Your job is to optimise an existing event listing to maximise discoverability, click-through rate, and attendance.

## Today's Date
${today}

## Current Event Details
- **Title:** ${event.title}
- **Description:** ${event.description || '(empty)'}
- **Date:** ${event.start_time}
- **Venue:** ${event.venue || '(not set)'}
- **Price:** £${event.price}
- **Capacity:** ${event.capacity}
- **Status:** ${event.status}

## Your Task
Analyse this event and provide an optimised version. Return ONLY a JSON block, then follow it with detailed reasoning.

\`\`\`json
{
  "title": "Optimised title (≤80 chars, location + activity + audience)",
  "description": "Optimised description (150-300 words, value-led, bullet points, CTA)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imageAlt": "Suggested alt text",
  "imageSuggestion": "Description of ideal event image",
  "timingSuggestion": "Is the date/time optimal for this event type?",
  "pricingSuggestion": "Is the price competitive?",
  "promotion": {
    "facebookSearchQueries": ["query1", "query2", "query3", "query4", "query5"],
    "recommendedGroupTypes": ["type1", "type2", "type3"],
    "otherPlatforms": ["platform: details"],
    "crossPromotion": "Meetup/Eventbrite category suggestions",
    "promotionTimeline": "When to start promoting",
    "samplePost": "Ready-to-use Facebook group post (2-3 sentences)"
  },
  "currentScore": 4,
  "optimisedScore": 8,
  "rationale": "Brief explanation of key changes"
}
\`\`\``;
}

function composeImageGenPrompt(event: SocialiseEvent): string {
  return `Create a vibrant, professional event banner image for a social event called "${event.title}" taking place in Bristol, UK.

Event details:
- Title: ${event.title}
- Venue: ${event.venue || 'Bristol venue'}
- Date: ${new Date(event.start_time).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
- Description: ${event.description ? event.description.slice(0, 200) : 'A social event'}

Style requirements:
- Warm, inviting atmosphere
- Suitable for Meetup and Eventbrite event covers
- Landscape orientation (16:9 ratio, 1920x1080)
- No text overlays (text will be added separately)
- Photorealistic or high-quality illustration style
- Bright, engaging colours that attract attention in a grid of event listings`;
}

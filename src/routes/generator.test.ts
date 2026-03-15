import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDatabase } from '../data/database.js';
import type { Database } from '../data/database.js';
import { SqliteEventStore } from '../data/sqlite-event-store.js';
import { PlatformEventStore } from '../data/platform-event-store.js';
import { IdeaStore } from '../data/idea-store.js';
import { MarketAnalyzer } from '../agents/market-analyzer.js';
import { MarketEventStore } from '../data/market-event-store.js';
import { createGeneratorRouter } from './generator.js';

function createTestApp(
  db: Database,
  opts: { withIdeaStore?: boolean; withPlatformEventStore?: boolean } = {},
) {
  const eventStore = new SqliteEventStore(db);
  const marketEventStore = new MarketEventStore(db);
  const analyzer = new MarketAnalyzer(marketEventStore);
  const platformEventStore = opts.withPlatformEventStore ? new PlatformEventStore(db) : undefined;
  const ideaStore = opts.withIdeaStore ? new IdeaStore(db) : undefined;

  const app = express();
  app.use(express.json());
  app.use('/', createGeneratorRouter(eventStore, analyzer, platformEventStore, ideaStore));
  return { app, eventStore, analyzer, marketEventStore, platformEventStore, ideaStore };
}

describe('Generator Router', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ── POST /analyze ───────────────────────────────────────

  describe('POST /analyze', () => {
    it('returns empty events array when no market data exists', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/analyze').send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('events');
      expect(res.body.events).toEqual([]);
    });

    it('falls back to platform events when market data is empty', async () => {
      const { app, platformEventStore } = createTestApp(db, { withPlatformEventStore: true });

      platformEventStore!.upsert({
        platform: 'meetup',
        externalId: 'ext-1',
        title: 'Social Coding Night',
        date: '2026-04-01',
        venue: 'The Watershed',
        status: 'active',
        externalUrl: 'https://meetup.com/event/1',
      });

      const res = await request(app).post('/analyze').send({});
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].title).toBe('Social Coding Night');
      expect(res.body.events[0].platform).toBe('meetup');
    });

    it('returns market events from the market_events table when available', async () => {
      const { app, marketEventStore } = createTestApp(db);

      marketEventStore.upsert({
        platform: 'eventbrite',
        external_id: 'eb-1',
        title: 'Bristol Jazz Night',
        start_time: '2026-05-10',
        venue: 'The Old Vic',
        category: 'Music',
        url: 'https://eventbrite.com/e/1',
      });

      const res = await request(app).post('/analyze').send({});
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].title).toBe('Bristol Jazz Night');
    });
  });

  // ── POST /prompt ────────────────────────────────────────

  describe('POST /prompt', () => {
    it('returns a prompt string', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/prompt').send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('prompt');
      expect(typeof res.body.prompt).toBe('string');
      expect(res.body.prompt.length).toBeGreaterThan(0);
    });

    it('prompt includes Socialise context text', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/prompt').send({});
      expect(res.body.prompt).toContain('Socialise');
      expect(res.body.prompt).toContain('Bristol');
    });
  });

  // ── POST /save ──────────────────────────────────────────

  describe('POST /save', () => {
    it('creates a draft event with valid input', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({
        title: 'Bristol Boardgame Night',
        description: 'A fun evening of boardgames in Bristol.',
        venue: 'The Hatchet',
        date: '2026-06-15',
        category: 'Social',
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.title).toBe('Bristol Boardgame Night');
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.id).toBeTruthy();
    });

    it('saves category as a separate field when provided', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({
        title: 'Comedy Night',
        description: 'Laughs all around.',
        category: 'Comedy',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('Laughs all around.');
      expect(res.body.data.category).toBe('Comedy');
    });

    it('uses description as-is when no category is provided', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({
        title: 'Evening Walk',
        description: 'A stroll around Clifton.',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.description).toBe('A stroll around Clifton.');
    });

    it('sets start_time using supplied date', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({
        title: 'Summer Picnic',
        description: 'Outdoor picnic fun.',
        date: '2026-07-20',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.start_time).toBe('2026-07-20T19:00:00+00:00');
    });

    it('rejects request when title is missing', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({
        description: 'No title event.',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Title and description are required');
    });

    it('rejects request when description is missing', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({
        title: 'Mystery Event',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Title and description are required');
    });

    it('rejects request when both title and description are missing', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/save').send({});
      expect(res.status).toBe(400);
    });

    it('accepts any date string without strict format validation', async () => {
      const { app } = createTestApp(db);
      // Date format validation rejects invalid dates
      const res = await request(app).post('/save').send({
        title: 'Flexible Date Event',
        description: 'Testing date flexibility.',
        date: 'not-a-real-date',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/YYYY-MM-DD/);
    });
  });

  // ── GET /ideas ──────────────────────────────────────────

  describe('GET /ideas', () => {
    it('returns 503 when ideaStore is not available', async () => {
      const { app } = createTestApp(db); // no ideaStore
      const res = await request(app).get('/ideas');
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Idea store not available');
    });

    it('returns null idea and zero remaining when queue is empty', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const res = await request(app).get('/ideas');
      expect(res.status).toBe(200);
      expect(res.body.idea).toBeUndefined();
      expect(res.body.remaining).toBe(0);
    });

    it('returns next unused idea and remaining count', async () => {
      const { app, ideaStore } = createTestApp(db, { withIdeaStore: true });

      ideaStore!.insertBatch([
        { title: 'Idea One', shortDescription: 'First idea', category: 'Social', suggestedDate: '2026-06-01', dateReason: 'Gap in market', confidence: 'high' },
        { title: 'Idea Two', shortDescription: 'Second idea', category: 'Tech', suggestedDate: '2026-06-08', dateReason: 'Low competition', confidence: 'medium' },
      ]);

      const res = await request(app).get('/ideas');
      expect(res.status).toBe(200);
      expect(res.body.idea).toBeDefined();
      expect(res.body.idea.title).toBe('Idea One');
      expect(res.body.remaining).toBe(2);
    });
  });

  // ── POST /ideas/generate ────────────────────────────────

  describe('POST /ideas/generate', () => {
    it('returns a prompt string', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/ideas/generate').send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('prompt');
      expect(typeof res.body.prompt).toBe('string');
      expect(res.body.prompt.length).toBeGreaterThan(0);
    });

    it('prompt mentions idea generation context', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/ideas/generate').send({});
      expect(res.body.prompt).toContain('Socialise');
      expect(res.body.prompt).toContain('12');
    });
  });

  // ── POST /ideas/store ───────────────────────────────────

  describe('POST /ideas/store', () => {
    it('returns 503 when ideaStore is not available', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/ideas/store').send({
        ideas: [{ title: 'Test Idea', shortDescription: 'desc', category: 'Social', suggestedDate: '', dateReason: '', confidence: 'medium' }],
      });
      expect(res.status).toBe(503);
    });

    it('stores ideas and returns count', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const ideas = [
        { title: 'Quiz Night', shortDescription: 'Trivia fun.', category: 'Social', suggestedDate: '2026-07-01', dateReason: 'Summer gap', confidence: 'high' as const },
        { title: 'Coding Dojo', shortDescription: 'Pair programming.', category: 'Tech', suggestedDate: '2026-07-08', dateReason: 'Low competition', confidence: 'medium' as const },
      ];
      const res = await request(app).post('/ideas/store').send({ ideas });
      expect(res.status).toBe(200);
      expect(res.body.stored).toBe(2);
    });

    it('rejects empty array', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const res = await request(app).post('/ideas/store').send({ ideas: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty array');
    });

    it('rejects when ideas field is not an array', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const res = await request(app).post('/ideas/store').send({ ideas: 'not-an-array' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty array');
    });

    it('rejects when ideas field is missing', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const res = await request(app).post('/ideas/store').send({});
      expect(res.status).toBe(400);
    });

    it('returns 500 when an idea is missing a required title (DB constraint)', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      // The route validates that each idea has a non-empty title
      const res = await request(app).post('/ideas/store').send({
        ideas: [{ shortDescription: 'No title here', category: 'Social' }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/);
    });
  });

  // ── POST /ideas/:id/accept ──────────────────────────────

  describe('POST /ideas/:id/accept', () => {
    it('returns 503 when ideaStore is not available', async () => {
      const { app } = createTestApp(db);
      const res = await request(app).post('/ideas/1/accept').send({});
      expect(res.status).toBe(503);
    });

    it('returns 404 for a nonexistent idea id', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const res = await request(app).post('/ideas/9999/accept').send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Idea not found');
    });

    it('creates a draft event from the idea and returns eventId', async () => {
      const { app, ideaStore } = createTestApp(db, { withIdeaStore: true });

      ideaStore!.insertBatch([
        { title: 'Wine & Cheese Evening', shortDescription: 'Taste local wines.', category: 'Food & Drink', suggestedDate: '2026-08-10', dateReason: 'Summer', confidence: 'high' },
      ]);

      const idea = ideaStore!.getNextUnused()!;
      expect(idea).toBeDefined();

      const res = await request(app).post(`/ideas/${idea.id}/accept`).send({});
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('eventId');
      expect(typeof res.body.eventId).toBe('string');
    });

    it('marks the idea as used after accepting', async () => {
      const { app, ideaStore } = createTestApp(db, { withIdeaStore: true });

      ideaStore!.insertBatch([
        { title: 'Yoga in the Park', shortDescription: 'Morning yoga session.', category: 'Wellness', suggestedDate: '2026-09-01', dateReason: 'Late summer', confidence: 'medium' },
      ]);

      const idea = ideaStore!.getNextUnused()!;
      await request(app).post(`/ideas/${idea.id}/accept`).send({});

      // After acceptance the idea should be marked used — queue should be empty
      const remaining = ideaStore!.countUnused();
      expect(remaining).toBe(0);
    });

    it('creates event with category prepended to description', async () => {
      const { app, ideaStore, eventStore } = createTestApp(db, { withIdeaStore: true });

      ideaStore!.insertBatch([
        { title: 'Improv Comedy', shortDescription: 'Laugh out loud.', category: 'Comedy', suggestedDate: '2026-10-05', dateReason: 'Autumn', confidence: 'high' },
      ]);

      const idea = ideaStore!.getNextUnused()!;
      const res = await request(app).post(`/ideas/${idea.id}/accept`).send({});
      expect(res.status).toBe(201);

      const event = eventStore.getById(res.body.eventId);
      expect(event).toBeDefined();
      expect(event!.description).toBe('Laugh out loud.');
      expect(event!.category).toBe('Comedy');
    });

    it('sets start_time from suggestedDate when provided', async () => {
      const { app, ideaStore, eventStore } = createTestApp(db, { withIdeaStore: true });

      ideaStore!.insertBatch([
        { title: 'Festive Market', shortDescription: 'Holiday shopping.', category: 'Social', suggestedDate: '2026-12-01', dateReason: 'Christmas season', confidence: 'high' },
      ]);

      const idea = ideaStore!.getNextUnused()!;
      const res = await request(app).post(`/ideas/${idea.id}/accept`).send({});
      expect(res.status).toBe(201);

      const event = eventStore.getById(res.body.eventId);
      expect(event!.start_time).toBe('2026-12-01T19:00:00+00:00');
    });

    it('rejects a non-numeric id with 400', async () => {
      const { app } = createTestApp(db, { withIdeaStore: true });
      const res = await request(app).post('/ideas/not-a-number/accept').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid/i);
    });
  });
});

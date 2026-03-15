import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { MarketAnalyzer } from '../agents/market-analyzer.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { IdeaStore } from '../data/idea-store.js';
import type { ScrapedEvent, SocialiseEvent, QueuedIdea } from '../shared/types.js'; // SocialiseEvent used by pastEvents array typing

/**
 * Generator router — endpoints for market analysis and event idea generation.
 *
 * Flow:
 * 1. POST /analyze        — scrapes competitor events, returns market data
 * 2. POST /prompt         — composes a Claude-ready prompt from market data + company context
 * 3. POST /save           — saves a generated idea as a draft event
 * 4. GET  /ideas          — returns next unused idea + remaining count
 * 5. POST /ideas/generate — composes batch idea generation prompt for Claude
 * 6. POST /ideas/store    — stores Claude-returned ideas in the queue
 * 7. POST /ideas/:id/accept — accepts an idea, creates a draft event
 */
export function createGeneratorRouter(
  eventStore: SqliteEventStore,
  analyzer: MarketAnalyzer,
  platformEventStore?: PlatformEventStore,
  ideaStore?: IdeaStore,
): Router {
  const router = Router();

  /**
   * POST /api/generator/analyze
   * Returns cached market events from market_events table.
   */
  router.post('/analyze', async (_req, res, next) => {
    try {
      let marketData = analyzer.getMarketData();
      // Fall back to synced platform events if no market data scraped yet
      if (marketData.length === 0 && platformEventStore) {
        const platformEvents = platformEventStore.getAll();
        marketData = platformEvents.map((pe) => ({
          title: pe.title,
          date: pe.date ?? '',
          venue: pe.venue ?? '',
          platform: pe.platform,
          url: pe.externalUrl ?? '',
          category: analyzer.inferCategory(pe.title),
          price: undefined,
          attendees: pe.attendance,
        }));
      }
      res.json({ events: marketData });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/generator/prompt
   * Composes a rich prompt for Claude based on cached market data + past events.
   * Returns { prompt: string } for the frontend to show in a review modal.
   */
  router.post('/prompt', async (_req, res, next) => {
    try {
      const marketData = analyzer.getMarketData();
      const pastEvents = eventStore.getAll();
      const prompt = composeClaudePrompt(marketData, pastEvents);
      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/generator/save
   * Saves a generated event idea as a draft.
   */
  router.post('/save', async (req, res, next) => {
    try {
      const { title, description, venue, date, category } = req.body as {
        title?: string;
        description?: string;
        venue?: string;
        date?: string;
        category?: string;
      };

      if (!title || !description) {
        return res.status(400).json({ error: 'Title and description are required' });
      }

      if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      }

      const event = eventStore.create({
        title,
        description: category ? `[${category}] ${description}` : description,
        venue: venue ?? '',
        start_time: date ? `${date}T19:00:00+00:00` : new Date().toISOString(),
        duration_minutes: 120,
        price: 0,
        capacity: 50,
      });

      res.status(201).json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/generator/ideas
   * Returns the next unused idea and the total remaining count.
   */
  router.get('/ideas', (_req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });
      const idea = ideaStore.getNextUnused();
      const remaining = ideaStore.countUnused();
      res.json({ idea, remaining });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/generator/ideas/generate
   * Composes a prompt for Claude to generate 12 new event ideas.
   * Returns { prompt } — client sends this to Claude, then POSTs the response to /ideas/store.
   */
  router.post('/ideas/generate', async (_req, res, next) => {
    try {
      const pastEvents = eventStore.getAll();
      const marketData = analyzer.getMarketData();
      const prompt = composeIdeaGenerationPrompt(pastEvents, marketData);
      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/generator/ideas/store
   * Receives { ideas: [...] } from the client after Claude responds,
   * persists them via ideaStore.insertBatch(), and returns { stored: N }.
   */
  router.post('/ideas/store', async (req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });
      const { ideas } = req.body as { ideas?: Omit<QueuedIdea, 'id' | 'used' | 'createdAt'>[] };
      if (!Array.isArray(ideas) || ideas.length === 0) {
        return res.status(400).json({ error: 'ideas must be a non-empty array' });
      }
      const invalid = ideas.some((idea) => !idea || typeof idea.title !== 'string' || !idea.title.trim());
      if (invalid) {
        return res.status(400).json({ error: 'Each idea must have a non-empty title' });
      }
      ideaStore.insertBatch(ideas);
      res.json({ stored: ideas.length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/generator/ideas/:id/accept
   * Marks the idea as used and creates a draft event from it.
   * Returns { eventId }.
   */
  router.post('/ideas/:id/accept', async (req, res, next) => {
    try {
      if (!ideaStore) return res.status(503).json({ error: 'Idea store not available' });
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid idea id' });
      const idea = ideaStore.getById(id);
      if (!idea) return res.status(404).json({ error: 'Idea not found' });

      ideaStore.markUsed(id);

      // Validate suggestedDate if present — must be YYYY-MM-DD
      const validDate = idea.suggestedDate && /^\d{4}-\d{2}-\d{2}$/.test(idea.suggestedDate)
        ? idea.suggestedDate : undefined;

      const event = eventStore.create({
        title: idea.title,
        description: idea.shortDescription
          ? (idea.category ? `[${idea.category}] ${idea.shortDescription}` : idea.shortDescription)
          : '',
        venue: '',
        start_time: validDate
          ? `${validDate}T19:00:00+00:00`
          : new Date().toISOString(),
        duration_minutes: 120,
        price: 0,
        capacity: 50,
      });

      res.status(201).json({ eventId: event.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── Prompt composition ──────────────────────────────────

function composeClaudePrompt(
  marketData: ScrapedEvent[],
  pastEvents: SocialiseEvent[],
): string {
  const today = new Date().toISOString().split('T')[0];

  // Section 1: External Bristol landscape (scraped market data)
  const marketList = marketData.length > 0
    ? marketData
        .map((e) => `  - "${e.title}" | ${e.date || 'TBD'} | ${e.venue || 'TBD'} | ${e.category ?? 'N/A'} | ${e.price ?? 'free'} | ${e.platform}`)
        .join('\n')
    : '  (No market data scraped yet — use your knowledge of Bristol events)';

  // Section 3: Socialise past events (style reference only)
  const pastSummary = pastEvents.length > 0
    ? pastEvents
        .slice(-10)
        .map((e) => `  - "${e.title}" | ${e.start_time.split('T')[0]} | ${e.venue || 'TBD'} | £${e.price} | cap ${e.capacity}`)
        .join('\n')
    : '  (No past events yet — this is a new company)';

  return `You are an event planning strategist for **Socialise**, a social events company based in Bristol, UK.

Today's date: ${today}

---

## Section 1: External Bristol Landscape (Scraped Market Data)

These are real upcoming events in Bristol scraped from Meetup, Eventbrite, and Headfirst Bristol:

${marketList}

---

## Section 2: Calendar & Cultural Context (Your AI Knowledge)

Use your knowledge to fill in:
- UK bank holidays in the next 60 days
- Major Bristol events, festivals, or cultural moments coming up
- Seasonal considerations (weather, university term times, tourist season)
- Days of week that work best for Bristol social events

---

## Section 3: Socialise Past Events (Style Reference Only)

These are Socialise's own past events — use them to understand the company's style, pricing, and capacity. Do NOT treat these as competition.

${pastSummary}

---

## Your Task

Analyse the Bristol market landscape above and identify the best upcoming date windows where Socialise could run a successful event (gaps in the market, low competition periods, cultural moments to leverage).

For each suggested event, provide:
- The optimal date and why it was chosen
- A creative, marketable event concept that fits that window
- Realistic capacity and pricing based on Socialise's past events

Respond ONLY with a JSON array. No markdown, no explanation outside the JSON:

\`\`\`json
[
  {
    "date": "YYYY-MM-DD",
    "dateReason": "Why this date is optimal (gap in market, cultural hook, etc.)",
    "title": "Catchy event title",
    "description": "2-3 sentence event description for attendees",
    "category": "e.g. Social | Tech | Food & Drink | Arts | Wellness | Comedy | Business",
    "venue_type": "e.g. pub | bar | gallery | outdoor | co-working space | theatre",
    "estimated_capacity": 50,
    "suggested_price": "£8",
    "confidence": "high | medium | low"
  }
]
\`\`\`

Suggest 5 events. Be specific and data-driven — reference actual gaps or hooks you identified.

Respond with ONLY the JSON. No markdown code fences, no explanation, no preamble.`;
}

function composeIdeaGenerationPrompt(
  pastEvents: SocialiseEvent[],
  marketData: ScrapedEvent[],
): string {
  const today = new Date().toISOString().split('T')[0];

  const pastSummary = pastEvents.length > 0
    ? pastEvents
        .slice(-10)
        .map((e) => `  - "${e.title}" | ${e.start_time.split('T')[0]} | ${e.venue || 'TBD'} | £${e.price} | cap ${e.capacity}`)
        .join('\n')
    : '  (No past events yet — this is a new company)';

  const marketList = marketData.length > 0
    ? marketData
        .map((e) => `  - "${e.title}" | ${e.date || 'TBD'} | ${e.venue || 'TBD'} | ${e.category ?? 'N/A'} | ${e.platform}`)
        .join('\n')
    : '  (No market data available — use your knowledge of Bristol events)';

  return `You are an event planning strategist for **Socialise**, a social events company based in Bristol, UK. Your job is to generate a batch of 12 fresh event ideas for the idea queue.

Today's date: ${today}

---

## Bristol Market Landscape

Recent competitor events scraped from Meetup, Eventbrite, and Headfirst Bristol:

${marketList}

---

## Socialise Past Events (Style Reference)

${pastSummary}

---

## Calendar & Cultural Context

Use your AI knowledge to factor in:
- UK bank holidays in the next 90 days
- Major Bristol events, festivals, or cultural moments
- Seasonal considerations (weather, university term times, tourist season)
- Best days of the week for Bristol social events

---

## Your Task

Generate exactly 12 event ideas for Socialise. Focus on:
- Gaps in the Bristol market (dates and categories with low competition)
- Cultural hooks and seasonal moments
- Variety across categories
- Ideas that match Socialise's style (social, affordable, accessible)

Respond ONLY with a JSON array. No markdown, no explanation outside the JSON:

\`\`\`json
[
  {
    "title": "Catchy event title",
    "shortDescription": "2-3 sentence description for attendees",
    "category": "Social | Tech | Food & Drink | Arts | Wellness | Comedy | Business | Outdoor | Music",
    "suggestedDate": "YYYY-MM-DD",
    "dateReason": "Why this date is optimal (gap, cultural hook, seasonal moment, etc.)",
    "confidence": "high | medium | low"
  }
]
\`\`\`

Generate all 12 ideas. Be specific — reference real gaps, hooks, or cultural moments you identified.

Respond with ONLY the JSON. No markdown code fences, no explanation, no preamble.`;
}


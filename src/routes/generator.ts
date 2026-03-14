import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { MarketAnalyzer } from '../agents/market-analyzer.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
import type { ScrapedEvent, SocialiseEvent } from '../shared/types.js'; // SocialiseEvent used by pastEvents array typing

/**
 * Generator router — endpoints for market analysis and event idea generation.
 *
 * Flow:
 * 1. POST /analyze  — scrapes competitor events, returns market data
 * 2. POST /prompt   — composes a Claude-ready prompt from market data + company context
 * 3. POST /save     — saves a generated idea as a draft event
 */
export function createGeneratorRouter(
  eventStore: SqliteEventStore,
  analyzer: MarketAnalyzer,
  platformEventStore?: PlatformEventStore,
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

Suggest 5 events. Be specific and data-driven — reference actual gaps or hooks you identified.`;
}


import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { MarketAnalyzer } from '../agents/market-analyzer.js';
import type { ScrapedEvent, SocialiseEvent } from '../shared/types.js';

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
): Router {
  const router = Router();

  /**
   * POST /api/generator/analyze
   * Scrapes public events from all connected platforms.
   */
  router.post('/analyze', async (_req, res, next) => {
    try {
      const events = await analyzer.analyze();
      res.json({ data: events, total: events.length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/generator/prompt
   * Composes a rich prompt for Claude based on market data + past events.
   * Returns { prompt: string } for the frontend to show in a review modal.
   */
  router.post('/prompt', async (req, res, next) => {
    try {
      const { marketData } = req.body as { marketData?: ScrapedEvent[] };
      if (!marketData?.length) {
        return res.status(400).json({ error: 'No market data provided' });
      }

      // Fetch company's own past events for context
      const pastEvents = eventStore.getAll();

      const prompt = composeClaudePrompt(marketData, pastEvents);
      res.json({ data: { prompt } });
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

  // Summarise market data by category
  const categories = new Map<string, number>();
  for (const e of marketData) {
    const cat = e.category ?? 'Other';
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
  }
  const categoryBreakdown = [...categories.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `  - ${cat}: ${count} events`)
    .join('\n');

  // Format market events as a compact list
  const marketList = marketData
    .map((e) => `  - "${e.title}" | ${e.date} | ${e.venue} | ${e.category ?? 'N/A'} | ${e.price ?? 'N/A'} | ${e.attendees ?? '?'} attendees`)
    .join('\n');

  // Summarise past events
  const pastSummary = pastEvents.length > 0
    ? pastEvents
        .slice(-10)
        .map((e) => `  - "${e.title}" | ${e.start_time} | ${e.venue} | ${e.status}`)
        .join('\n')
    : '  (No past events yet — this is a new company)';

  return `You are an event planning strategist for **Socialise**, a social events company based in Bristol, UK. Your goal is to analyse the current local market and suggest creative, viable event ideas that would fill a gap or outperform competitors.

## Today's Date
${today}

## Market Analysis — Upcoming Events in Bristol
${marketList}

## Category Breakdown
${categoryBreakdown}

## Socialise's Past Events
${pastSummary}

## Your Task
Based on the market data above, please:

1. **Identify 3-5 market gaps or opportunities** — categories, time slots, venues, or audience segments that are underserved.

2. **Generate 5 creative event ideas** for Socialise. For each idea, provide:
   - **Title**: A catchy, marketable event name
   - **Category**: e.g., Social, Tech, Food & Drink, Arts, Wellness, etc.
   - **Description**: 2-3 sentences explaining the event concept
   - **Rationale**: Why this event would succeed (based on the market data)
   - **Suggested Date**: A specific date (within the next 30 days)
   - **Suggested Venue**: A Bristol venue that fits the concept
   - **Estimated Attendance**: Realistic number based on similar events

3. **Rank the ideas** from most promising to least, with a brief explanation of your ranking.

Please be specific, creative, and data-driven. Avoid generic suggestions — reference actual market gaps you identified.`;
}

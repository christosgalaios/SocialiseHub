import { Router } from 'express';
import type { SqliteEventStore } from '../data/sqlite-event-store.js';
import type { MarketAnalyzer } from '../agents/market-analyzer.js';
import type { PlatformEventStore } from '../data/platform-event-store.js';
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
  platformEventStore?: PlatformEventStore,
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

  /**
   * POST /api/generator/optimize/:id
   * Composes an SEO optimization prompt for an existing event.
   * Analyzes current event details and suggests improved title, description, tags.
   */
  router.post('/optimize/:id', async (req, res, next) => {
    try {
      const event = eventStore.getById(req.params.id);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Gather context: similar events from synced data
      const allSynced = platformEventStore?.getAll() ?? [];
      const similarEvents = allSynced
        .filter((pe) => pe.title && pe.title !== event.title)
        .slice(0, 20);

      const pastEvents = eventStore.getAll();

      const prompt = composeOptimizePrompt(event, similarEvents, pastEvents);
      res.json({ data: { prompt } });
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

// ── SEO Optimization Prompt ─────────────────────────────

interface SimilarEvent {
  title: string;
  date?: string;
  venue?: string;
  status: string;
}

function composeOptimizePrompt(
  event: SocialiseEvent,
  similarEvents: SimilarEvent[],
  pastEvents: SocialiseEvent[],
): string {
  const today = new Date().toISOString().split('T')[0];

  const similarList = similarEvents.length > 0
    ? similarEvents
        .map((e) => `  - "${e.title}" | ${e.date ?? 'No date'} | ${e.venue ?? 'No venue'} | ${e.status}`)
        .join('\n')
    : '  (No similar events available)';

  const pastSummary = pastEvents
    .filter((e) => e.id !== event.id)
    .slice(-10)
    .map((e) => `  - "${e.title}" | ${e.venue} | ${e.status}`)
    .join('\n') || '  (No other events)';

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
- **Image URL:** ${event.imageUrl || '(none)'}
- **Status:** ${event.status}

## Similar Events on the Platform
${similarList}

## Socialise's Other Events
${pastSummary}

## Your Task
Analyse this event and provide an optimised version. For each field, explain what you changed and why.

### 1. **Optimised Title**
- Make it search-friendly (include location, key activity, audience)
- Keep it under 80 characters
- Make it compelling — would you click on this?

### 2. **Optimised Description**
- Lead with the value proposition (what attendees get)
- Include relevant keywords naturally (Bristol, social, the activity type)
- Structure with short paragraphs, bullet points for scanability
- Include a clear call-to-action
- 150-300 words ideal

### 3. **Suggested Tags/Keywords**
- 5-10 SEO-relevant tags for platform search algorithms
- Mix of broad (e.g., "Bristol events") and specific (e.g., "networking for professionals")

### 4. **Image Recommendations**
- What kind of image would work best for this event?
- Suggested alt text for accessibility and SEO
- Ideal dimensions/aspect ratio for Meetup and Eventbrite

### 5. **Timing & Pricing Suggestions**
- Is the date/time optimal for this type of event?
- Is the price competitive based on similar events?

### 6. **Promotion & Distribution Strategy**
This is critical. We've proven that targeted community advertising sells out events. Example: a "Frog Walk" event was promoted in ecology-focused Facebook groups in Bristol and sold out.

For THIS event, provide:
- **Facebook Group Search Queries**: 5-8 specific search terms to find relevant Facebook groups (e.g., for a frog walk: "Bristol ecology group", "Bristol nature walks", "wildlife lovers Bristol", "Bristol environmental")
- **Recommended Group Types**: What types of communities would be interested? (hobby groups, local area groups, professional groups, university societies, etc.)
- **Other Platforms**: Reddit communities, Instagram hashtags, local forums, newsletters, notice boards
- **Cross-promotion**: Which Meetup/Eventbrite categories to list under
- **Timing**: When to start promoting (how many days before the event)
- **Post Template**: A short, engaging Facebook group post for this event (2-3 sentences + link)

### 7. **Overall SEO Score**
Rate the current listing 1-10 and the optimised version 1-10, with brief justification.

Please format your response as structured JSON so the app can auto-apply changes:
\`\`\`json
{
  "title": "Optimised title here",
  "description": "Optimised description here",
  "tags": ["tag1", "tag2", ...],
  "imageAlt": "Suggested alt text",
  "imageSuggestion": "Description of ideal image",
  "timingSuggestion": "Your timing advice",
  "pricingSuggestion": "Your pricing advice",
  "promotion": {
    "facebookSearchQueries": ["query1", "query2", ...],
    "recommendedGroupTypes": ["type1", "type2", ...],
    "otherPlatforms": ["platform: details", ...],
    "crossPromotion": "Category suggestions",
    "promotionTimeline": "When to start promoting",
    "samplePost": "Ready-to-use Facebook group post"
  },
  "currentScore": 4,
  "optimisedScore": 8,
  "rationale": "Brief explanation of key changes"
}
\`\`\`

Follow the JSON with your detailed reasoning for each change.`;
}

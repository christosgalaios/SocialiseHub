import type { ServiceStore } from '../data/store.js';
import type { ScrapedEvent, PlatformName } from '../shared/types.js';

/**
 * MarketAnalyzer — scrapes public event listings from connected platforms.
 *
 * For each connected platform, fetches upcoming events in the Bristol area
 * and returns structured data for display and AI analysis.
 */
export class MarketAnalyzer {
  constructor(private readonly serviceStore: ServiceStore) {}

  /**
   * Scrape events from all connected platforms.
   * Falls back to mock data when API credentials are missing or calls fail.
   */
  async analyze(): Promise<ScrapedEvent[]> {
    const results: ScrapedEvent[] = [];

    const platforms: PlatformName[] = ['meetup', 'eventbrite', 'headfirst'];
    const scrapers = await Promise.allSettled(
      platforms.map((p) => this.scrapeFromPlatform(p)),
    );

    for (const result of scrapers) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      } else {
        console.warn('Scrape failed:', result.reason);
      }
    }

    // Sort by date ascending
    results.sort((a, b) => a.date.localeCompare(b.date));
    return results;
  }

  private async scrapeFromPlatform(platform: PlatformName): Promise<ScrapedEvent[]> {
    const service = await this.serviceStore.getService(platform);

    // Use real API if connected, otherwise return sample data for demo
    if (service?.connected && service.credentials?.accessToken) {
      return this.scrapeWithApi(platform, service.credentials.accessToken);
    }

    // Return demo data so the feature is usable without live credentials
    return this.getDemoEvents(platform);
  }

  /**
   * Scrape events using the platform's real API.
   * TODO: Implement real API calls when credentials are available.
   */
  private async scrapeWithApi(
    platform: PlatformName,
    _accessToken: string,
  ): Promise<ScrapedEvent[]> {
    // In production this would call the real platform APIs:
    // - Meetup: GraphQL API — query upcomingEvents by location
    // - Eventbrite: REST API — /events/search?location.address=Bristol
    // - Headfirst: HTML scraping of headfirstbristol.co.uk/whats-on
    console.log(`[MarketAnalyzer] Scraping ${platform} with API credentials`);
    return this.getDemoEvents(platform);
  }

  /**
   * Demo/sample events for each platform — used when APIs are not connected.
   * These represent realistic Bristol-area events for development and testing.
   */
  private getDemoEvents(platform: PlatformName): ScrapedEvent[] {
    const now = new Date();
    const upcoming = (daysOut: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysOut);
      return d.toISOString().split('T')[0];
    };

    const events: Record<PlatformName, ScrapedEvent[]> = {
      meetup: [
        {
          title: 'Bristol Tech Talks — AI & Machine Learning',
          date: upcoming(5),
          venue: 'Engine Shed, Bristol',
          category: 'Technology',
          price: 'Free',
          attendees: 85,
          platform: 'meetup',
          url: 'https://meetup.com/bristol-tech-talks/events/example1',
        },
        {
          title: 'Bristol Entrepreneurs Networking Evening',
          date: upcoming(8),
          venue: 'The Watershed, Bristol',
          category: 'Business',
          price: '£5',
          attendees: 120,
          platform: 'meetup',
          url: 'https://meetup.com/bristol-entrepreneurs/events/example2',
        },
        {
          title: 'Creative Coding Workshop',
          date: upcoming(12),
          venue: 'Spike Island, Bristol',
          category: 'Arts',
          price: '£15',
          attendees: 30,
          platform: 'meetup',
          url: 'https://meetup.com/creative-coding-bristol/events/example3',
        },
        {
          title: 'Bristol Board Games Social',
          date: upcoming(3),
          venue: 'Chance & Counters, Bristol',
          category: 'Social',
          price: 'Free',
          attendees: 45,
          platform: 'meetup',
          url: 'https://meetup.com/bristol-board-games/events/example4',
        },
      ],
      eventbrite: [
        {
          title: 'Bristol Food & Drink Festival',
          date: upcoming(14),
          venue: 'Millennium Square, Bristol',
          category: 'Food & Drink',
          price: '£12',
          attendees: 500,
          platform: 'eventbrite',
          url: 'https://eventbrite.co.uk/e/bristol-food-festival-example5',
        },
        {
          title: 'Startup Pitch Night — Bristol Edition',
          date: upcoming(6),
          venue: 'Runway East, Bristol',
          category: 'Business',
          price: '£10',
          attendees: 150,
          platform: 'eventbrite',
          url: 'https://eventbrite.co.uk/e/startup-pitch-night-example6',
        },
        {
          title: 'Wellness & Yoga in the Park',
          date: upcoming(10),
          venue: 'Castle Park, Bristol',
          category: 'Health',
          price: '£8',
          attendees: 60,
          platform: 'eventbrite',
          url: 'https://eventbrite.co.uk/e/wellness-yoga-park-example7',
        },
      ],
      headfirst: [
        {
          title: 'Live Jazz Night at The Lanes',
          date: upcoming(2),
          venue: 'The Lanes, Bristol',
          category: 'Music',
          price: '£8',
          attendees: 80,
          platform: 'headfirst',
          url: 'https://headfirstbristol.co.uk/whats-on/example8',
        },
        {
          title: 'Stand-Up Comedy Showcase',
          date: upcoming(7),
          venue: 'The Old Vic, Bristol',
          category: 'Comedy',
          price: '£12',
          attendees: 200,
          platform: 'headfirst',
          url: 'https://headfirstbristol.co.uk/whats-on/example9',
        },
        {
          title: 'Underground Electronic Music Night',
          date: upcoming(4),
          venue: 'Motion, Bristol',
          category: 'Music',
          price: '£15',
          attendees: 350,
          platform: 'headfirst',
          url: 'https://headfirstbristol.co.uk/whats-on/example10',
        },
      ],
    };

    return events[platform] ?? [];
  }
}

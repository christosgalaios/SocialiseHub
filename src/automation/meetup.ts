import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const _SELECTORS = {
  loggedInAvatar: '[data-testid="avatar"], .member-menu, img[alt*="profile"]',
  groupLink: 'a[href*="/groups/"]',
  groupName: '[data-testid="group-name"], .groupHomeHeader-groupName, h1',
};

// Meetup publish uses GraphQL mutations (no DOM selectors needed)
// See meetupPublishSteps() — verified via introspection 2026-03-14

export function meetupConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.meetup.com/login/',
      description: 'Opening Meetup login...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    // Wait for user to log in (poll until GraphQL confirms authentication)
    {
      action: 'evaluate',
      script: `(async () => {
        // Poll for up to 120 seconds waiting for the user to log in
        const maxWait = 120_000;
        const pollInterval = 3_000;
        const start = Date.now();

        while (Date.now() - start < maxWait) {
          try {
            const resp = await fetch('https://www.meetup.com/gql2', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: '{ self { id name memberships(first: 50) { edges { metadata { role } node { id urlname name } } } } }'
              }),
            });
            if (resp.ok) {
              const json = await resp.json();
              if (json?.data?.self?.id) {
                // User is authenticated — extract groups
                const result = { loggedIn: true, groups: [], groupUrlname: null, error: null };
                const edges = json.data.self.memberships?.edges ?? [];

                for (const edge of edges) {
                  const role = edge.metadata?.role ?? 'MEMBER';
                  const g = edge.node;
                  result.groups.push({
                    urlname: g.urlname,
                    name: g.name,
                    isOrganizer: role === 'ORGANIZER' || role === 'COORGANIZER',
                  });
                }

                const orgGroup = result.groups.find(g => g.isOrganizer) ?? result.groups[0];
                result.groupUrlname = orgGroup?.urlname ?? null;
                return JSON.stringify(result);
              }
            }
          } catch { /* retry */ }

          await new Promise(r => setTimeout(r, pollInterval));
        }

        return JSON.stringify({ loggedIn: false, groups: [], groupUrlname: null, error: 'Login timed out — please log in to Meetup in the panel on the right.' });
      })()`,
      description: 'Waiting for Meetup login (log in on the right panel)...',
    },
  ];
}

/**
 * Publish an event to Meetup via GraphQL createEvent mutation.
 * No DOM automation needed — uses the gql2 API directly.
 * Verified via introspection 2026-03-14.
 */
export function meetupPublishSteps(event: SocialiseEvent, groupUrlname: string, draft = false): AutomationStep[] {
  // Compute duration in ISO 8601 format (PT2H, PT1H30M, etc.)
  const durationMin = Math.max(event.duration_minutes ?? 120, 30);
  const hours = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  const isoDuration = `PT${hours > 0 ? hours + 'H' : ''}${mins > 0 ? mins + 'M' : ''}`;

  return [
    {
      action: 'navigate',
      url: `https://www.meetup.com/${groupUrlname}/`,
      description: 'Opening Meetup group page...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    {
      action: 'evaluate',
      script: `(async () => {
        try {
          const resp = await fetch('https://www.meetup.com/gql2', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: 'mutation($input: CreateEventInput!) { createEvent(input: $input) { event { id title eventUrl dateTime } errors { code message field } } }',
              variables: {
                input: {
                  groupUrlname: ${JSON.stringify(groupUrlname)},
                  title: ${JSON.stringify(event.title)},
                  description: ${JSON.stringify(event.description ?? '')},
                  startDateTime: ${JSON.stringify(event.start_time)},
                  duration: ${JSON.stringify(isoDuration)},
                  publishStatus: ${JSON.stringify(draft ? 'DRAFT' : 'PUBLISHED')},
                  ${event.price && event.price > 0 ? `feeOption: { amount: ${event.price}, currency: "GBP", required: true },` : ''}
                }
              }
            })
          });
          const json = await resp.json();
          if (json.errors) {
            return JSON.stringify({ error: 'GraphQL error: ' + json.errors[0]?.message });
          }
          const result = json.data?.createEvent;
          if (result?.errors?.length > 0) {
            return JSON.stringify({ error: 'Meetup error: ' + result.errors[0]?.message });
          }
          const ev = result?.event;
          if (!ev) {
            return JSON.stringify({ error: 'No event returned from createEvent mutation' });
          }
          return JSON.stringify({
            externalId: ev.id,
            externalUrl: ev.eventUrl,
            draft: ${JSON.stringify(draft)},
          });
        } catch (err) {
          return JSON.stringify({ error: String(err) });
        }
      })()`,
      description: draft ? 'Creating draft event via Meetup API...' : 'Publishing event via Meetup API...',
    },
  ];
}

/**
 * Steps to scrape public Bristol events from Meetup via the gql2 GraphQL endpoint.
 * Does NOT require authentication — uses public rankedEvents query.
 * Returns: { success: true, events: [...] }
 */
export function meetupPublicScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.meetup.com/find/?location=gb--bristol&source=EVENTS',
      description: 'Opening Meetup Bristol events listing...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    {
      action: 'evaluate',
      script: `(async () => {
        // Bristol lat/lon, 25 mile radius, next 90 days, first 50 results
        const now = new Date();
        const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const startDateRange = now.toISOString();
        const endDateRange = end.toISOString();

        const query = \`
          query($lat: Float!, $lon: Float!, $radius: Float!, $startDateRange: DateTime, $endDateRange: DateTime) {
            rankedEvents(
              filter: {
                lat: $lat
                lon: $lon
                radius: $radius
                startDateRange: $startDateRange
                endDateRange: $endDateRange
              }
              first: 50
            ) {
              edges {
                node {
                  id
                  title
                  dateTime
                  eventUrl
                  eventType
                  rsvps { totalCount }
                  maxTickets
                  venue {
                    name
                    city
                  }
                }
              }
            }
          }
        \`;

        try {
          const resp = await fetch('https://www.meetup.com/gql2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              variables: {
                lat: 51.4545,
                lon: -2.5879,
                radius: 25,
                startDateRange,
                endDateRange,
              },
            }),
          });

          if (!resp.ok) {
            return JSON.stringify({ success: false, error: 'GraphQL request failed: HTTP ' + resp.status });
          }

          const json = await resp.json();
          if (json.errors) {
            return JSON.stringify({ success: false, error: JSON.stringify(json.errors) });
          }

          const edges = json?.data?.rankedEvents?.edges ?? [];
          const events = edges.map(e => ({
            id: e.node.id,
            title: e.node.title,
            date: e.node.dateTime,
            venue: e.node.venue ? (e.node.venue.name + (e.node.venue.city ? ', ' + e.node.venue.city : '')) : '',
            url: e.node.eventUrl,
            category: e.node.eventType ?? '',
            going: e.node.rsvps?.totalCount ?? 0,
            maxTickets: e.node.maxTickets ?? null,
          }));

          return JSON.stringify({ success: true, events });
        } catch (err) {
          return JSON.stringify({ success: false, error: String(err) });
        }
      })()`,
      description: 'Fetching public Bristol events via Meetup GraphQL...',
    },
  ];
}

export function meetupScrapeSteps(groupUrlname: string): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: `https://www.meetup.com/${groupUrlname}/events/`,
      description: 'Opening events list...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    // Fetch both upcoming and past events via GraphQL with pagination
    // Schema verified via introspection 2026-03-14: going→removed (use rsvps.totalCount),
    // imageUrl→removed (use featuredEventPhoto.baseUrl), venue/maxTickets/feeSettings unchanged
    {
      action: 'evaluate',
      script: `(async () => {
        const allEvents = [];
        const seen = new Set();
        const NODE_FIELDS = 'id title dateTime eventUrl description maxTickets venue { name } rsvps { totalCount } featuredEventPhoto { baseUrl } feeSettings { amount currency } hosts { name }';

        // Helper: fetch a page of events with given status
        async function fetchPage(status, cursor) {
          const afterArg = cursor ? ', after: $after' : '';
          const vars = { urlname: ${JSON.stringify(groupUrlname)} };
          if (cursor) vars.after = cursor;
          const resp = await fetch('https://www.meetup.com/gql2', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: 'query($urlname: String!' + (cursor ? ', $after: String' : '') + ') { groupByUrlname(urlname: $urlname) { events(status: ' + status + ', first: 50, sort: DESC' + afterArg + ') { edges { node { ' + NODE_FIELDS + ' } } pageInfo { hasNextPage endCursor } } } }',
              variables: vars,
            }),
          });
          if (!resp.ok) {
            console.error('[meetup-scrape] GraphQL HTTP error:', resp.status, resp.statusText);
            return { edges: [], hasNext: false, cursor: null, error: 'HTTP ' + resp.status };
          }
          const json = await resp.json();
          if (json.errors) {
            console.error('[meetup-scrape] GraphQL errors:', JSON.stringify(json.errors));
            return { edges: [], hasNext: false, cursor: null, error: json.errors[0]?.message };
          }
          if (!json?.data?.groupByUrlname) {
            console.error('[meetup-scrape] groupByUrlname is null — auth may have expired');
            return { edges: [], hasNext: false, cursor: null, error: 'groupByUrlname null' };
          }
          const data = json.data.groupByUrlname.events ?? {};
          return {
            edges: data.edges ?? [],
            hasNext: data.pageInfo?.hasNextPage ?? false,
            cursor: data.pageInfo?.endCursor ?? null,
          };
        }

        function mapNode(node, label) {
          return {
            externalId: node.id, title: node.title,
            date: node.dateTime, venue: node.venue?.name ?? '',
            url: node.eventUrl, status: label,
            going: node.rsvps?.totalCount ?? null,
            maxTickets: node.maxTickets ?? null,
            fee: node.feeSettings?.amount ?? null,
            description: node.description ?? null,
            imageUrl: node.featuredEventPhoto?.baseUrl ?? null,
            organizerName: Array.isArray(node.hosts) && node.hosts.length > 0
              ? node.hosts.map(h => h.name).join(', ') : null,
          };
        }

        // Helper: paginate all events for a given status
        async function fetchAllWithStatus(status, label) {
          let cursor = null;
          for (let page = 0; page < 10; page++) {
            const result = await fetchPage(status, cursor);
            if (result.error) {
              console.error('[meetup-scrape] error fetching', status, ':', result.error);
              break;
            }
            for (const e of result.edges) {
              if (seen.has(e.node.id)) continue;
              seen.add(e.node.id);
              allEvents.push(mapNode(e.node, label));
            }
            if (!result.hasNext || !result.cursor) break;
            cursor = result.cursor;
          }
        }

        // Try a single test query first to check auth
        const testResult = await fetchPage('ACTIVE', null);
        if (testResult.error) {
          return JSON.stringify({ error: 'Meetup API error: ' + testResult.error + ' — try reconnecting Meetup from Services page' });
        }

        // Process test result events
        for (const e of testResult.edges) {
          if (seen.has(e.node.id)) continue;
          seen.add(e.node.id);
          allEvents.push(mapNode(e.node, 'active'));
        }

        // Continue fetching remaining ACTIVE pages
        if (testResult.hasNext && testResult.cursor) {
          let cursor = testResult.cursor;
          for (let page = 1; page < 10; page++) {
            const result = await fetchPage('ACTIVE', cursor);
            for (const e of result.edges) {
              if (seen.has(e.node.id)) continue;
              seen.add(e.node.id);
              allEvents.push(mapNode(e.node, 'active'));
            }
            if (!result.hasNext || !result.cursor) break;
            cursor = result.cursor;
          }
        }

        // Fetch other statuses
        await fetchAllWithStatus('DRAFT', 'draft');
        await fetchAllWithStatus('PAST', 'past');
        await fetchAllWithStatus('CANCELLED', 'cancelled');
        await fetchAllWithStatus('CANCELLED_PERM', 'cancelled');

        console.log('[meetup-scrape] Total events scraped:', allEvents.length);
        return JSON.stringify(allEvents);
      })()`,
      description: 'Fetching upcoming and past events via API...',
    },
  ];
}

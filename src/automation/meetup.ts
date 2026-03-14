import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const SELECTORS = {
  loggedInAvatar: '[data-testid="avatar"], .member-menu, img[alt*="profile"]',
  groupLink: 'a[href*="/groups/"]',
  groupName: '[data-testid="group-name"], .groupHomeHeader-groupName, h1',
};

const PUBLISH_SELECTORS = {
  titleInput: '[data-testid="event-name-input"], input[name="name"], #event-name',
  descriptionEditor: '[data-testid="event-description"] [contenteditable], .ql-editor, [contenteditable="true"]',
  dateInput: '[data-testid="event-date-input"], input[type="date"], input[name="date"]',
  timeInput: '[data-testid="event-time-input"], input[type="time"], input[name="time"]',
  publishButton: '[data-testid="publish-button"], button[type="submit"]:last-of-type',
  draftButton: 'button[data-testid="save-draft-button"], button:has(> span:contains("Draft")), button[aria-label*="draft"], button[aria-label*="Draft"]',
};

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

export function meetupPublishSteps(event: SocialiseEvent, groupUrlname: string, draft = false): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

  // The final submit step: either click Publish or save as Draft
  const submitStep: AutomationStep = draft
    ? {
        action: 'evaluate',
        script: `(() => {
          // Meetup's draft button varies — try multiple strategies
          const buttons = Array.from(document.querySelectorAll('button'));
          const draftBtn = buttons.find(b => /draft/i.test(b.textContent ?? '') || /save.*draft/i.test(b.textContent ?? ''));
          if (draftBtn) { draftBtn.click(); return 'clicked-draft'; }
          // Fallback: look for a dropdown/menu that reveals draft option
          const moreBtn = buttons.find(b => /more|options|chevron/i.test(b.getAttribute('aria-label') ?? ''));
          if (moreBtn) { moreBtn.click(); return 'opened-menu'; }
          return 'draft-button-not-found';
        })()`,
        description: 'Saving as draft...',
      }
    : {
        action: 'click',
        selector: PUBLISH_SELECTORS.publishButton,
        description: 'Publishing event...',
      };

  return [
    {
      action: 'navigate',
      url: `https://www.meetup.com/${groupUrlname}/events/create/`,
      description: 'Opening event creation page...',
    },
    {
      action: 'waitForSelector',
      selector: PUBLISH_SELECTORS.titleInput,
      timeout: 15_000,
      description: 'Waiting for form to load...',
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.titleInput,
      value: event.title,
      description: `Filling title: "${event.title}"`,
    },
    {
      action: 'evaluate',
      script: `(() => {
        const editor = document.querySelector('${PUBLISH_SELECTORS.descriptionEditor}');
        if (editor) {
          editor.innerHTML = ${JSON.stringify(event.description)};
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()`,
      description: 'Filling description...',
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.dateInput,
      value: dateStr,
      description: `Setting date: ${dateStr}`,
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.timeInput,
      value: timeStr,
      description: `Setting time: ${timeStr}`,
    },
    submitStep,
    {
      action: 'waitForNavigation',
      timeout: 15_000,
      description: 'Waiting for confirmation...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const match = url.match(/events\\/(\\d+)/);
        return JSON.stringify({
          externalId: match ? match[1] : null,
          externalUrl: url,
          draft: ${draft},
        });
      })()`,
      description: 'Extracting event ID...',
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
                  going
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
            going: e.node.going ?? 0,
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
    {
      action: 'evaluate',
      script: `(async () => {
        const allEvents = [];
        const seen = new Set();

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
              query: 'query($urlname: String!' + (cursor ? ', $after: String' : '') + ') { groupByUrlname(urlname: $urlname) { events(status: ' + status + ', first: 50, sort: DESC' + afterArg + ') { edges { node { id title dateTime eventUrl going maxTickets venue { name } feeSettings { amount currency } } } pageInfo { hasNextPage endCursor } } } }',
              variables: vars,
            }),
          });
          if (!resp.ok) return { edges: [], hasNext: false, cursor: null };
          const json = await resp.json();
          if (json.errors) return { edges: [], hasNext: false, cursor: null };
          const data = json?.data?.groupByUrlname?.events ?? {};
          return {
            edges: data.edges ?? [],
            hasNext: data.pageInfo?.hasNextPage ?? false,
            cursor: data.pageInfo?.endCursor ?? null,
          };
        }

        // Helper: paginate all events for a given status
        async function fetchAllWithStatus(status, label) {
          let cursor = null;
          for (let page = 0; page < 10; page++) {
            const result = await fetchPage(status, cursor);
            for (const e of result.edges) {
              if (seen.has(e.node.id)) continue;
              seen.add(e.node.id);
              allEvents.push({
                externalId: e.node.id, title: e.node.title,
                date: e.node.dateTime, venue: e.node.venue?.name ?? '',
                url: e.node.eventUrl, status: label,
                going: e.node.going ?? null,
                maxTickets: e.node.maxTickets ?? null,
                fee: e.node.feeSettings?.amount ?? null,
              });
            }
            if (!result.hasNext || !result.cursor) break;
            cursor = result.cursor;
          }
        }

        // Fetch upcoming events (ACTIVE + DRAFT)
        await fetchAllWithStatus('ACTIVE', 'active');
        await fetchAllWithStatus('DRAFT', 'draft');

        // Fetch past events (PAST + CANCELLED + CANCELLED_PERM)
        await fetchAllWithStatus('PAST', 'past');
        await fetchAllWithStatus('CANCELLED', 'cancelled');
        await fetchAllWithStatus('CANCELLED_PERM', 'cancelled');

        return JSON.stringify(allEvents);
      })()`,
      description: 'Fetching upcoming and past events via API...',
    },
  ];
}

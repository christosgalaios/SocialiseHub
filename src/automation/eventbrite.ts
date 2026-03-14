// src/automation/eventbrite.ts
import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const SELECTORS = {
  loggedInNav: '[data-testid="user-nav"], .global-header__avatar, .user-menu',
  orgIdLink: 'a[href*="/organizations/"]',
};

// Verified against live Eventbrite DOM 2026-03-14 at /manage/events/create
const PUBLISH_SELECTORS = {
  titleInput: '#details-form-event-title, [data-testid="EventTitleFormField"], input[name="title"]',
  summaryTextarea: '#details-form-summary, [data-testid="SummaryFormField"], textarea[name="summary"]',
  descriptionEditor: '[role="textbox"][aria-label*="text editor"], [contenteditable="true"]',
  dateInput: '#form-range-date-field, [data-testid="DateInputInput"], input[name="dates"]',
  startTimeInput: '#form-start-time-field, [data-testid="TimeInputInput"][name="startTime"], input[name="startTime"]',
  endTimeInput: '#form-end-time-field, input[name="endTime"]',
  venueInput: '#VenueLocationField, [data-testid="VenueLocationField"], input[aria-label="Location"]',
  submitButton: 'button[type="submit"]',
};

/**
 * Steps to check if the user is logged into Eventbrite and detect their organization.
 * Navigates to Eventbrite and polls API until authenticated, then fetches org info.
 * Returns: lastEvalResult = { loggedIn: boolean, organizationId?: string, organizationName?: string }
 */
export function eventbriteConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.co.uk/signin/',
      description: 'Opening Eventbrite login...',
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
        const maxWait = 120_000;
        const pollInterval = 3_000;
        const start = Date.now();

        while (Date.now() - start < maxWait) {
          try {
            const csrfToken = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
            const meResp = await fetch('/api/v3/users/me/', {
              credentials: 'include',
              headers: { 'X-CSRFToken': csrfToken },
            });
            if (meResp.ok) {
              // Authenticated — fetch organizations
              const orgsResp = await fetch('/api/v3/users/me/organizations/', {
                credentials: 'include',
                headers: { 'X-CSRFToken': csrfToken },
              });
              const result = { loggedIn: true, organizationId: null, organizationName: null, error: null };
              if (orgsResp.ok) {
                const orgsJson = await orgsResp.json();
                const orgs = orgsJson?.organizations ?? [];
                if (orgs.length > 0) {
                  result.organizationId = orgs[0].id;
                  result.organizationName = orgs[0].name;
                }
              }
              return JSON.stringify(result);
            }
          } catch { /* retry */ }

          await new Promise(r => setTimeout(r, pollInterval));
        }

        return JSON.stringify({ loggedIn: false, organizationId: null, organizationName: null, error: 'Login timed out — please log in to Eventbrite in the panel on the right.' });
      })()`,
      description: 'Waiting for Eventbrite login (log in on the right panel)...',
    },
  ];
}

/**
 * Steps to publish an event on Eventbrite via the multi-step wizard.
 * Timeout: 15s per step (wizard transitions are slow).
 */
export function eventbritePublishSteps(event: SocialiseEvent): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

  // Eventbrite uses .co.uk and a single-page create form at /manage/events/create
  // All sections (title, summary, description, date, location) are on one page
  // Verified against live DOM 2026-03-14
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.co.uk/manage/events/create',
      description: 'Opening event creation page...',
    },
    {
      action: 'waitForSelector',
      selector: PUBLISH_SELECTORS.titleInput,
      timeout: 15_000,
      description: 'Waiting for title field...',
    },
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.titleInput,
      value: event.title,
      description: `Filling title: "${event.title}"`,
    },
    // Summary (short description, 140 char limit)
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.summaryTextarea,
      value: (event.description ?? '').slice(0, 140),
      description: 'Filling summary...',
    },
    // Description (rich text editor — contenteditable div)
    {
      action: 'evaluate',
      script: `(() => {
        const editor = document.querySelector('[role="textbox"][aria-label*="text editor"]');
        if (editor) {
          editor.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, ${JSON.stringify(event.description ?? '')});
          return 'filled';
        }
        return 'no-editor';
      })()`,
      description: 'Filling description...',
    },
    // Date — Eventbrite uses DD/MM/YYYY format
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.dateInput,
      value: dateStr.split('-').reverse().join('/'),
      description: `Setting date: ${dateStr}`,
    },
    // Start time — HH:MM format
    {
      action: 'fill',
      selector: PUBLISH_SELECTORS.startTimeInput,
      value: timeStr,
      description: `Setting start time: ${timeStr}`,
    },
    // Location
    ...(event.venue ? [
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.venueInput,
        value: event.venue,
        description: `Setting venue: ${event.venue}`,
      },
    ] : []),
    // Save and continue (step 1 of wizard — saves as draft, goes to tickets step)
    {
      action: 'click',
      selector: PUBLISH_SELECTORS.submitButton,
      description: 'Saving event page...',
    },
    {
      action: 'waitForNavigation',
      timeout: 15_000,
      description: 'Waiting for save...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const eidMatch = url.match(/events\\/(\\d+)/);
        const externalId = eidMatch ? eidMatch[1] : null;
        return JSON.stringify({ externalId, externalUrl: url });
      })()`,
      description: 'Extracting event ID...',
    },
  ];
}

/**
 * Steps to scrape public Bristol events from Eventbrite's search API.
 * Does NOT require authentication — uses public search endpoint.
 * Returns: { success: true, events: [...] }
 */
export function eventbritePublicScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.co.uk/d/united-kingdom--bristol/events/',
      description: 'Opening Eventbrite Bristol events listing...',
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
          // Use Eventbrite's public search API — no auth required for public listings
          const params = new URLSearchParams({
            q: '',
            location: 'Bristol, UK',
            within: '25mi',
            expand: 'venue,ticket_classes,category',
            page_size: '50',
            sort_by: 'date',
          });

          const resp = await fetch('https://www.eventbrite.co.uk/api/v3/destination/events/?' + params.toString(), {
            headers: {
              'Accept': 'application/json',
            },
          });

          if (!resp.ok) {
            // Fallback: try the public search endpoint used by the listing page
            const searchResp = await fetch(
              'https://www.eventbrite.co.uk/api/v3/destination/search/?q=&place_id=ChIJYdizgVuFcUgRB58lAUbqLTQ&online_events_only=false&page_size=50&expand=venue,ticket_classes',
              { headers: { 'Accept': 'application/json' } }
            );
            if (!searchResp.ok) {
              return JSON.stringify({ success: false, error: 'Search API failed: HTTP ' + searchResp.status });
            }
            const searchJson = await searchResp.json();
            const rawEvents = searchJson?.events?.results ?? searchJson?.results ?? [];
            const events = rawEvents.map(e => ({
              id: e.id,
              title: e.name?.text ?? e.name ?? '',
              date: e.start?.utc ?? e.start_date ?? '',
              venue: e.venue ? (e.venue.name + (e.venue.address?.city ? ', ' + e.venue.address.city : '')) : (e.is_online_event ? 'Online' : ''),
              url: e.url ?? '',
              category: e.category?.name ?? '',
              price: e.ticket_classes?.[0]?.cost?.display ?? (e.is_free ? 'Free' : ''),
            }));
            return JSON.stringify({ success: true, events });
          }

          const json = await resp.json();
          const rawEvents = json?.events?.results ?? json?.results ?? [];
          const events = rawEvents.map(e => ({
            id: e.id,
            title: e.name?.text ?? e.name ?? '',
            date: e.start?.utc ?? e.start_date ?? '',
            venue: e.venue ? (e.venue.name + (e.venue.address?.city ? ', ' + e.venue.address.city : '')) : (e.is_online_event ? 'Online' : ''),
            url: e.url ?? '',
            category: e.category?.name ?? '',
            price: e.ticket_classes?.[0]?.cost?.display ?? (e.is_free ? 'Free' : ''),
          }));

          return JSON.stringify({ success: true, events });
        } catch (err) {
          return JSON.stringify({ success: false, error: String(err) });
        }
      })()`,
      description: 'Fetching public Bristol events via Eventbrite search API...',
    },
  ];
}

/**
 * Steps to scrape events from Eventbrite using the REST API.
 */
export function eventbriteScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.co.uk/organizations/home/',
      description: 'Opening Eventbrite...',
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
        const csrfToken = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
        const headers = { 'X-CSRFToken': csrfToken };

        // Check auth first
        const meResp = await fetch('/api/v3/users/me/', {
          credentials: 'include', headers
        });
        if (!meResp.ok) return JSON.stringify({ error: 'Not authenticated — please connect Eventbrite first.' });

        // Get org ID
        const orgsResp = await fetch('/api/v3/users/me/organizations/', {
          credentials: 'include', headers
        });
        if (!orgsResp.ok) return JSON.stringify({ error: 'Failed to fetch organizations (HTTP ' + orgsResp.status + ')' });
        const orgsJson = await orgsResp.json();
        const orgId = orgsJson?.organizations?.[0]?.id;
        if (!orgId) return JSON.stringify({ error: 'No organization found on this Eventbrite account.' });

        // Paginate through all events (draft, live, started, ended, completed)
        const allEvents = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 20) {
          const eventsResp = await fetch(
            '/api/v3/organizations/' + orgId + '/events/?status=draft,live,started,ended,completed&order_by=start_desc&page_size=50&page=' + page + '&expand=ticket_classes',
            { credentials: 'include', headers }
          );
          if (!eventsResp.ok) {
            if (allEvents.length === 0) return JSON.stringify({ error: 'Failed to fetch events (HTTP ' + eventsResp.status + ')' });
            break;
          }
          const eventsJson = await eventsResp.json();
          const events = eventsJson?.events ?? [];
          for (const e of events) {
            const isPast = e.status === 'ended' || e.status === 'completed';
            // Derive attendance, capacity, ticket price from ticket_classes
            let attendance = null;
            let capacity = null;
            let revenue = null;
            let ticketPrice = null;
            const ticketClasses = e.ticket_classes ?? [];
            if (ticketClasses.length > 0) {
              const tc = ticketClasses[0];
              ticketPrice = tc.cost?.major_value ? parseFloat(tc.cost.major_value) : null;
              capacity = ticketClasses.reduce((sum, t) => sum + (t.quantity_total ?? 0), 0) || null;
              const sold = ticketClasses.reduce((sum, t) => sum + (t.quantity_sold ?? 0), 0);
              attendance = sold || null;
              revenue = (ticketPrice && attendance) ? ticketPrice * attendance : null;
            }
            allEvents.push({
              externalId: e.id,
              title: e.name?.text ?? '',
              date: e.start?.utc ?? '',
              venue: '',
              url: e.url ?? '',
              status: isPast ? 'past' : 'active',
              attendance,
              capacity,
              revenue,
              ticketPrice,
            });
          }
          hasMore = eventsJson?.pagination?.has_more_items === true;
          page++;
        }
        return JSON.stringify(allEvents);
      })()`,
      description: 'Fetching events via API...',
    },
  ];
}

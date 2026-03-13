// src/automation/eventbrite.ts
import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const SELECTORS = {
  loggedInNav: '[data-testid="user-nav"], .global-header__avatar, .user-menu',
  orgIdLink: 'a[href*="/organizations/"]',
};

const PUBLISH_SELECTORS = {
  titleInput: '[data-testid="event-title-input"], input[name="title"], #event-title',
  descriptionEditor: '[data-testid="event-description"] [contenteditable], .ql-editor, [contenteditable="true"]',
  dateInput: '[data-testid="start-date"], input[name="startDate"], input[type="date"]',
  timeInput: '[data-testid="start-time"], input[name="startTime"], input[type="time"]',
  ticketTypeSelector: '[data-testid="ticket-type-selector"], .ticket-type-toggle',
  freeTicketOption: '[data-testid="free-ticket"], button:contains("Free"), .ticket-free-option',
  paidTicketOption: '[data-testid="paid-ticket"], button:contains("Paid"), .ticket-paid-option',
  ticketPriceInput: '[data-testid="ticket-price"], input[name="price"]',
  ticketQuantityInput: '[data-testid="ticket-quantity"], input[name="quantity"]',
  venueInput: '[data-testid="venue-input"], input[name="venue"], #venue-search',
  nextButton: '[data-testid="next-step"], button.eds-btn--submit, button[type="submit"]',
  publishButton: '[data-testid="publish-button"], button[data-testid="publish"], button.eds-btn--submit:last-of-type',
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

  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.com/create',
      description: 'Opening event creation wizard...',
    },
    // Step 1: Basic info
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
    // Date/time step
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
    // Location step
    ...(event.venue ? [
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.venueInput,
        value: event.venue,
        description: `Setting venue: ${event.venue}`,
      },
    ] : []),
    // Tickets step — free or paid
    ...(event.price && event.price > 0 ? [
      {
        action: 'click' as const,
        selector: PUBLISH_SELECTORS.paidTicketOption,
        description: 'Selecting paid ticket type...',
      },
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.ticketPriceInput,
        value: String(event.price),
        description: `Setting ticket price: £${event.price}`,
      },
    ] : [
      {
        action: 'click' as const,
        selector: PUBLISH_SELECTORS.freeTicketOption,
        description: 'Selecting free ticket type...',
      },
    ]),
    // Capacity
    ...(event.capacity ? [
      {
        action: 'fill' as const,
        selector: PUBLISH_SELECTORS.ticketQuantityInput,
        value: String(event.capacity),
        description: `Setting capacity: ${event.capacity}`,
      },
    ] : []),
    // Publish
    {
      action: 'click',
      selector: PUBLISH_SELECTORS.publishButton,
      description: 'Publishing event...',
    },
    {
      action: 'waitForNavigation',
      timeout: 15_000,
      description: 'Waiting for confirmation...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const eidMatch = url.match(/eid=(\\d+)/);
        const pathMatch = url.match(/event\\/(\\d+)/);
        const externalId = eidMatch ? eidMatch[1] : pathMatch ? pathMatch[1] : null;
        return JSON.stringify({ externalId, externalUrl: url });
      })()`,
      description: 'Extracting event ID...',
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
            '/api/v3/organizations/' + orgId + '/events/?status=draft,live,started,ended,completed&order_by=start_desc&page_size=50&page=' + page,
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
            allEvents.push({
              externalId: e.id,
              title: e.name?.text ?? '',
              date: e.start?.utc ?? '',
              venue: '',
              url: e.url ?? '',
              status: isPast ? 'past' : 'active',
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

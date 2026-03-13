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
 * Steps to check if the user is logged into Eventbrite.
 * Returns: lastEvalResult = { loggedIn: boolean, organizationId?: string }
 */
export function eventbriteConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.com/',
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
      script: `(() => {
        const nav = document.querySelector('${SELECTORS.loggedInNav}');
        if (!nav) return JSON.stringify({ loggedIn: false });
        const orgLink = document.querySelector('${SELECTORS.orgIdLink}');
        const orgMatch = orgLink?.getAttribute('href')?.match(/organizations\\/(\\d+)/);
        return JSON.stringify({ loggedIn: true, organizationId: orgMatch ? orgMatch[1] : null });
      })()`,
      description: 'Checking login status...',
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
 * Steps to scrape events from Eventbrite organizations dashboard.
 */
export function eventbriteScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.eventbrite.com/organizations/events/',
      description: 'Opening events dashboard...',
    },
    {
      action: 'waitForSelector',
      selector: '[data-testid="event-list-item"], .event-list-item, table tbody tr',
      timeout: 15_000,
      description: 'Waiting for events list to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const rows = document.querySelectorAll('[data-testid="event-list-item"], .event-list-item, table tbody tr');
        const events = [];
        for (const row of rows) {
          const link = row.querySelector('a[href*="/event/"], a[href*="eid="]');
          const href = link?.getAttribute('href') ?? '';
          const eidMatch = href.match(/eid=(\\d+)/) ?? href.match(/event\\/(\\d+)/);
          const title = row.querySelector('[data-testid="event-name"], .event-name, td:first-child a')?.textContent?.trim() ?? '';
          const dateEl = row.querySelector('time, [data-testid="event-date"], td:nth-child(2)');
          const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
          const status = row.querySelector('[data-testid="event-status"], .event-status')?.textContent?.trim() ?? '';
          if (title) {
            events.push({
              externalId: eidMatch ? eidMatch[1] : href,
              title,
              date,
              status,
              url: href.startsWith('http') ? href : 'https://www.eventbrite.com' + href,
            });
          }
        }
        return JSON.stringify(events);
      })()`,
      description: 'Scraping event data...',
    },
  ];
}

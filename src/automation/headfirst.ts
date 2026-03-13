// src/automation/headfirst.ts
import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const SELECTORS = {
  loggedInIndicator: '.user-menu, .account-nav, a[href*="/logout"], a[href*="/account"]',
};

const FORM_SELECTORS = {
  titleInput: 'input[name="title"], input[name="event_name"], #event-title',
  descriptionTextarea: 'textarea[name="description"], textarea[name="event_description"], #event-description',
  dateInput: 'input[name="date"], input[type="date"], #event-date',
  timeInput: 'input[name="time"], input[type="time"], #event-time',
  venueDropdown: 'select[name="venue"], select[name="venue_id"], #event-venue',
  venueTextInput: 'input[name="venue"], input[name="venue_name"]',
  priceInput: 'input[name="price"], input[name="ticket_price"], #event-price',
  submitButton: 'button[type="submit"], input[type="submit"]',
};

/**
 * Steps to check if the user is logged into Headfirst Bristol.
 * Returns: lastEvalResult = { loggedIn: boolean }
 */
export function headfirstConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/',
      description: 'Opening Headfirst Bristol...',
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
        const indicator = document.querySelector('${SELECTORS.loggedInIndicator}');
        return JSON.stringify({ loggedIn: !!indicator });
      })()`,
      description: 'Checking login status...',
    },
  ];
}

/**
 * Steps to publish an event on Headfirst Bristol.
 * Uses a simple HTML form — no complex editor or wizard.
 */
export function headfirstPublishSteps(event: SocialiseEvent): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/submit-event',
      description: 'Opening event submission form...',
    },
    {
      action: 'waitForSelector',
      selector: FORM_SELECTORS.titleInput,
      timeout: 10_000,
      description: 'Waiting for form to load...',
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.titleInput,
      value: event.title,
      description: `Filling title: "${event.title}"`,
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.descriptionTextarea,
      value: event.description,
      description: 'Filling description...',
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.dateInput,
      value: dateStr,
      description: `Setting date: ${dateStr}`,
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.timeInput,
      value: timeStr,
      description: `Setting time: ${timeStr}`,
    },
    // Venue — try dropdown first, fall back to text input
    ...(event.venue ? [
      {
        action: 'evaluate' as const,
        script: `(() => {
          const dropdown = document.querySelector('${FORM_SELECTORS.venueDropdown}');
          if (dropdown) {
            const options = Array.from(dropdown.querySelectorAll('option'));
            const match = options.find(o => o.textContent?.toLowerCase().includes(${JSON.stringify(event.venue.toLowerCase())}));
            if (match) { dropdown.value = match.value; dropdown.dispatchEvent(new Event('change', { bubbles: true })); return 'dropdown'; }
          }
          const textInput = document.querySelector('${FORM_SELECTORS.venueTextInput}');
          if (textInput) { textInput.value = ${JSON.stringify(event.venue)}; textInput.dispatchEvent(new Event('input', { bubbles: true })); return 'text'; }
          return 'not_found';
        })()`,
        description: `Setting venue: ${event.venue}`,
      },
    ] : []),
    // Price
    ...(event.price !== undefined ? [
      {
        action: 'fill' as const,
        selector: FORM_SELECTORS.priceInput,
        value: String(event.price),
        description: `Setting price: £${event.price}`,
      },
    ] : []),
    {
      action: 'click',
      selector: FORM_SELECTORS.submitButton,
      description: 'Submitting event...',
    },
    {
      action: 'waitForNavigation',
      timeout: 10_000,
      description: 'Waiting for confirmation...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const idMatch = url.match(/event\\/(\\d+)/) ?? url.match(/(\\d+)/);
        return JSON.stringify({
          externalId: idMatch ? idMatch[1] : null,
          externalUrl: url,
        });
      })()`,
      description: 'Extracting event ID...',
    },
  ];
}

/**
 * Steps to scrape events from a Headfirst Bristol user listing.
 */
export function headfirstScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/my-events',
      description: 'Opening my events...',
    },
    {
      action: 'waitForSelector',
      selector: '.event-card, .event-listing, a[href*="/event/"]',
      timeout: 10_000,
      description: 'Waiting for events to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const items = document.querySelectorAll('.event-card, .event-listing, [data-event-id]');
        const events = [];
        for (const item of items) {
          const link = item.querySelector('a[href*="/event/"]') ?? item.closest('a');
          const href = link?.getAttribute('href') ?? '';
          const idMatch = href.match(/event\\/(\\d+)/);
          const title = item.querySelector('h2, h3, .event-title')?.textContent?.trim() ?? '';
          const dateEl = item.querySelector('time, .event-date');
          const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
          const venue = item.querySelector('.event-venue, .venue')?.textContent?.trim() ?? '';
          if (title) {
            events.push({
              externalId: idMatch ? idMatch[1] : href,
              title,
              date,
              venue,
              url: href.startsWith('http') ? href : 'https://www.headfirstbristol.co.uk' + href,
            });
          }
        }
        return JSON.stringify(events);
      })()`,
      description: 'Scraping event data...',
    },
  ];
}

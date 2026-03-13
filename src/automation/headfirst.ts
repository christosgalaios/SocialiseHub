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
 * Steps to check if the user is logged into Headfirst Bristol and detect their organization.
 * Navigates to the event manager (redirects to login if not authenticated) and polls until logged in.
 * Returns: lastEvalResult = { loggedIn: boolean, organizationId?: string, organizationName?: string }
 */
export function headfirstConnectSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/event-manager#/events',
      description: 'Opening Headfirst Event Manager...',
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
          await new Promise(r => setTimeout(r, pollInterval));

          // Check for org link — only appears when logged in to event manager
          const orgLink = document.querySelector('a[href*="/organisations/"]');
          const orgMatch = orgLink?.getAttribute('href')?.match(/organisations\\/(\\d+)/);
          const hasSignOut = document.body.textContent?.includes('Sign Out');

          if (orgMatch || hasSignOut) {
            const result = { loggedIn: true, organizationId: null, organizationName: null };
            if (orgMatch) result.organizationId = orgMatch[1];

            // Get org name directly from the org link's text content
            const orgLinkEl = document.querySelector('a[href*="/organisations/"]');
            if (orgLinkEl) {
              const text = orgLinkEl.textContent?.trim();
              if (text && text !== 'Organisation') result.organizationName = text;
            }

            return JSON.stringify(result);
          }
        }

        return JSON.stringify({ loggedIn: false, organizationId: null, organizationName: null, error: 'Login timed out — please log in to Headfirst in the panel on the right.' });
      })()`,
      description: 'Waiting for Headfirst login (log in on the right panel)...',
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
 * Steps to scrape events from the Headfirst Bristol event manager.
 */
export function headfirstScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/event-manager#/events',
      description: 'Opening Headfirst Event Manager...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    // Scrape both future and past events by navigating to each tab
    {
      action: 'evaluate',
      script: `(async () => {
        const allEvents = [];
        const seen = new Set();

        async function scrapeCurrentPage(statusLabel) {
          // Poll until event links appear or timeout after 15s
          const pollStart = Date.now();
          while (Date.now() - pollStart < 15000) {
            if (document.querySelectorAll('a[href*="#/events/"]').length > 2) break;
            await new Promise(r => setTimeout(r, 500));
          }

          const links = document.querySelectorAll('a[href*="/events/"]');
          for (const a of links) {
            const match = a.href.match(/#\\/events\\/(\\d+)/);
            if (!match || seen.has(match[1])) continue;
            const id = match[1];
            seen.add(id);

            const text = a.textContent?.trim() ?? '';
            if (!text || /^\\d+\\s*\\/|^\\xA3|doorlist|orders/i.test(text)) continue;

            allEvents.push({
              externalId: id,
              title: text,
              date: '',
              venue: '',
              url: 'https://www.headfirstbristol.co.uk/event-manager#/events/' + id + '/details',
              status: statusLabel,
            });
          }

          // Enrich with date/venue from detail links
          for (const evt of allEvents) {
            if (evt.date) continue;
            const detailLinks = document.querySelectorAll('a[href*="/events/' + evt.externalId + '/details"]');
            for (const dl of detailLinks) {
              const t = dl.textContent?.trim() ?? '';
              const dateMatch = t.match(/^(\\w+,\\s*\\d+\\w*\\s+\\w+\\s*-\\s*\\d+:\\d+)/);
              if (dateMatch) {
                const afterTime = t.replace(dateMatch[1], '').trim();
                evt.date = dateMatch[1];
                if (afterTime) evt.venue = afterTime;
              }
            }
          }
        }

        // Scrape future events first (default view)
        await scrapeCurrentPage('active');

        // Navigate to past events tab
        window.location.hash = '#/events/past';
        await new Promise(r => setTimeout(r, 1000));
        await scrapeCurrentPage('past');

        return JSON.stringify(allEvents);
      })()`,
      description: 'Fetching future and past events from Event Manager...',
    },
  ];
}

// src/automation/headfirst.ts
import type { AutomationStep } from './types.js';
import type { SocialiseEvent } from '../shared/types.js';

const _SELECTORS = {
  loggedInIndicator: '.user-menu, .account-nav, a[href*="/logout"], a[href*="/account"]',
};

// Verified against live Headfirst Event Manager DOM 2026-03-15
// Create flow: event-manager → "Create Event" → date picker → venue combobox + type select → create
// Edit flow: /event-manager#/events/{id}/editor/details → name, short desc, description → Save Changes
const FORM_SELECTORS = {
  // Create modal
  createButton: 'button.events-view__create-button',
  calendarDay: '.calendar__day',
  monthSelect: 'select[aria-label="Select month"]',
  venueCombobox: '.hf-modal__content input[role="combobox"]',
  eventTypeSelect: '.hf-modal__content select.hf-select',
  modalCreateButton: '.hf-modal__actions .hf-button',
  // Edit page (event-manager#/events/{id}/editor/details)
  eventName: 'input[name="event_name"]',
  shortDescription: 'input[name="desc_short"]',
  descriptionEditor: '[aria-label="editable markdown"][role="textbox"]',
  saveButton: 'button[type="submit"]',
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
 * Steps to create an event on Headfirst Bristol via the Event Manager.
 * Two-phase: (1) create skeleton via modal (date + venue + type), (2) fill details on editor page.
 * Verified against live DOM 2026-03-15.
 */
export function headfirstPublishSteps(event: SocialiseEvent): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const day = startDate.getDate();
  const month = startDate.getMonth(); // 0-indexed

  return [
    // Phase 1: Create event skeleton via modal
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/event-manager#/events/future',
      description: 'Opening Headfirst Event Manager...',
    },
    {
      action: 'waitForSelector',
      selector: FORM_SELECTORS.createButton,
      timeout: 15_000,
      description: 'Waiting for event manager to load...',
    },
    {
      action: 'click',
      selector: FORM_SELECTORS.createButton,
      description: 'Clicking Create Event...',
    },
    {
      action: 'waitForSelector',
      selector: FORM_SELECTORS.calendarDay,
      timeout: 10_000,
      description: 'Waiting for date picker...',
    },
    // Select the correct month and day in the calendar
    {
      action: 'evaluate',
      script: `(async () => {
        // Navigate to the correct month using the month select
        const monthSelect = document.querySelector('${FORM_SELECTORS.monthSelect}');
        if (monthSelect) {
          const options = Array.from(monthSelect.options);
          // Find the option matching our target month (options contain month names)
          const targetMonth = ${month};
          if (options[targetMonth]) {
            monthSelect.selectedIndex = targetMonth;
            monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 500));
          }
        }
        // Click the target day
        const days = Array.from(document.querySelectorAll('${FORM_SELECTORS.calendarDay}'));
        const dayBtn = days.find(b => b.textContent?.trim() === '${day}');
        if (dayBtn) { dayBtn.click(); return 'selected day ${day}'; }
        return 'day not found';
      })()`,
      description: `Selecting date: ${startDate.toDateString()}...`,
    },
    // Wait for venue/type fields to appear after date selection
    {
      action: 'waitForSelector',
      selector: FORM_SELECTORS.eventTypeSelect,
      timeout: 5_000,
      description: 'Waiting for venue & type fields...',
    },
    // Set event type (default to "other" = Arts & Performance)
    {
      action: 'evaluate',
      script: `(() => {
        const select = document.querySelector('${FORM_SELECTORS.eventTypeSelect}');
        if (select) {
          select.value = 'other';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return 'set type';
        }
        return 'no select';
      })()`,
      description: 'Setting event type...',
    },
    // Type venue name in combobox (if provided)
    ...(event.venue ? [
      {
        action: 'evaluate' as const,
        script: `(async () => {
          const input = document.querySelector('${FORM_SELECTORS.venueCombobox}');
          if (!input) return 'no venue input';
          input.focus();
          input.value = ${JSON.stringify(event.venue)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          // Wait for autocomplete suggestions
          await new Promise(r => setTimeout(r, 1500));
          // Click first suggestion if any
          const suggestions = document.querySelectorAll('.hf-modal__content [class*="option"], .hf-modal__content li');
          if (suggestions.length > 0) { suggestions[0].click(); return 'selected suggestion'; }
          return 'typed venue (no suggestions)';
        })()`,
        description: `Setting venue: ${event.venue}`,
      },
    ] : []),
    // Click "Create Event" in modal
    {
      action: 'click',
      selector: FORM_SELECTORS.modalCreateButton,
      description: 'Creating event...',
    },
    // Wait for event creation — poll for new event link in the list or URL change
    {
      action: 'evaluate',
      script: `(async () => {
        // Capture existing event IDs before creation
        const existingIds = new Set(
          Array.from(document.querySelectorAll('a[href*="/events/"]'))
            .map(a => a.href.match(/events\\/(\\d+)/)?.[1])
            .filter(Boolean)
        );
        // Poll for a new event ID to appear
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          // Check URL first (might redirect to editor)
          const urlMatch = window.location.href.match(/events\\/(\\d+).*editor/);
          if (urlMatch) return JSON.stringify({ eventId: urlMatch[1] });
          // Check for new event links in the list
          const currentLinks = Array.from(document.querySelectorAll('a[href*="/events/"]'));
          for (const link of currentLinks) {
            const id = link.href.match(/events\\/(\\d+)/)?.[1];
            if (id && !existingIds.has(id)) return JSON.stringify({ eventId: id });
          }
        }
        return JSON.stringify({ error: 'Timed out waiting for event creation' });
      })()`,
      description: 'Waiting for event to be created...',
    },
    // Phase 2: Navigate to editor and wait for form to render
    {
      action: 'evaluate',
      script: `(async () => {
        // Extract event ID from current URL or previous step result
        const match = window.location.href.match(/events\\/(\\d+)/);
        if (!match) return JSON.stringify({ error: 'No event ID found in URL' });
        const eventId = match[1];
        // Navigate to the details editor
        window.location.hash = '/events/' + eventId + '/editor/details';
        // Poll for the event name input to appear (SPA routing)
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const nameInput = document.querySelector('${FORM_SELECTORS.eventName}');
          if (nameInput) return JSON.stringify({ ready: true, eventId });
        }
        return JSON.stringify({ error: 'Editor form did not load within 30 seconds' });
      })()`,
      description: 'Opening event editor and waiting for form...',
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.eventName,
      value: event.title,
      description: `Setting title: "${event.title}"`,
    },
    {
      action: 'fill',
      selector: FORM_SELECTORS.shortDescription,
      value: (event.description ?? '').slice(0, 200),
      description: 'Setting short description...',
    },
    // Fill the markdown description editor
    {
      action: 'evaluate',
      script: `(() => {
        const editor = document.querySelector('${FORM_SELECTORS.descriptionEditor}');
        if (editor) {
          editor.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, ${JSON.stringify(event.description ?? '')});
          return 'filled';
        }
        return 'no editor';
      })()`,
      description: 'Filling description...',
    },
    // Save
    {
      action: 'click',
      selector: FORM_SELECTORS.saveButton,
      description: 'Saving event...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const url = window.location.href;
        const match = url.match(/events\\/(\\d+)/);
        return JSON.stringify({
          externalId: match ? match[1] : null,
          externalUrl: 'https://www.headfirstbristol.co.uk/#/events/' + (match ? match[1] : ''),
        });
      })()`,
      description: 'Extracting event ID...',
    },
  ];
}

/**
 * Steps to scrape public Bristol events from the Headfirst Bristol what's-on listing.
 * Does NOT require authentication — DOM-scrapes the public listing page.
 * Returns: { success: true, events: [...] }
 */
export function headfirstPublicScrapeSteps(): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: 'https://www.headfirstbristol.co.uk/whats-on',
      description: 'Opening Headfirst Bristol what\'s on listing...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 15_000,
      description: 'Waiting for page to load (Headfirst is slower)...',
    },
    {
      action: 'evaluate',
      script: `(async () => {
        // Extra wait for Headfirst's JS-rendered content
        await new Promise(r => setTimeout(r, 5000));

        try {
          const events = [];

          // Headfirst uses event card elements — try multiple common selectors
          // The listing page typically has article or div cards with event info
          const cards = document.querySelectorAll(
            'article.event, .event-card, .event-listing, [class*="EventCard"], [class*="event-item"], ' +
            '.listing-item, .whats-on-item, article[data-event-id], .event'
          );

          if (cards.length > 0) {
            for (const card of cards) {
              // Title — try various heading/link selectors
              const titleEl = card.querySelector('h1, h2, h3, h4, .event-title, [class*="title"], a[href*="/event"]');
              const title = titleEl?.textContent?.trim() ?? '';
              if (!title) continue;

              // URL — find an anchor pointing to an event page
              const linkEl = card.querySelector('a[href*="/event"], a[href*="/e/"]') ?? titleEl?.closest('a') ?? card.querySelector('a');
              let url = linkEl?.getAttribute('href') ?? '';
              if (url && !url.startsWith('http')) {
                url = 'https://www.headfirstbristol.co.uk' + url;
              }

              // Date — look for time element or date-like text
              const timeEl = card.querySelector('time, [class*="date"], [class*="Date"]');
              const date = timeEl?.getAttribute('datetime') ?? timeEl?.textContent?.trim() ?? '';

              // Venue
              const venueEl = card.querySelector('[class*="venue"], [class*="Venue"], [class*="location"]');
              const venue = venueEl?.textContent?.trim() ?? '';

              // Price
              const priceEl = card.querySelector('[class*="price"], [class*="Price"], [class*="cost"], [class*="ticket"]');
              const price = priceEl?.textContent?.trim() ?? '';

              // Extract ID from URL
              const idMatch = url.match(/\\/event(?:s)?\\/(\\d+|[a-z0-9-]+)/i);
              const id = idMatch ? idMatch[1] : url.split('/').filter(Boolean).pop() ?? '';

              events.push({ id, title, date, venue, url, price });
            }
          } else {
            // Fallback: scrape all event links from the page
            const links = document.querySelectorAll('a[href*="/event"]');
            const seen = new Set();

            for (const link of links) {
              const href = link.getAttribute('href') ?? '';
              if (seen.has(href) || !href) continue;
              seen.add(href);

              const title = link.textContent?.trim() ?? '';
              if (!title || title.length < 3) continue;

              let url = href;
              if (!url.startsWith('http')) {
                url = 'https://www.headfirstbristol.co.uk' + url;
              }

              const idMatch = url.match(/\\/event(?:s)?\\/(\\d+|[a-z0-9-]+)/i);
              const id = idMatch ? idMatch[1] : url.split('/').filter(Boolean).pop() ?? '';

              // Look for date/venue in adjacent text
              const parent = link.parentElement;
              const parentText = parent?.textContent?.trim() ?? '';
              const dateMatch = parentText.match(/(\\d{1,2}(?:st|nd|rd|th)?\\s+\\w+\\s+\\d{4}|\\w+\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4})/i);
              const date = dateMatch ? dateMatch[1] : '';

              events.push({ id, title, date, venue: '', url, price: '' });
            }
          }

          return JSON.stringify({ success: true, events });
        } catch (err) {
          return JSON.stringify({ success: false, error: String(err) });
        }
      })()`,
      description: 'Scraping public events from Headfirst Bristol listing...',
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

        // Navigate to past events tab — poll for new links instead of fixed wait
        const beforeIds = new Set([...document.querySelectorAll('a[href*="#/events/"]')].map(a => a.href));
        window.location.hash = '#/events/past';
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 500));
          const current = document.querySelectorAll('a[href*="#/events/"]');
          const newLinks = [...current].some(a => !beforeIds.has(a.href));
          if (newLinks || i > 3) break;
        }
        await scrapeCurrentPage('past');

        return JSON.stringify(allEvents);
      })()`,
      description: 'Fetching future and past events from Event Manager...',
    },
  ];
}

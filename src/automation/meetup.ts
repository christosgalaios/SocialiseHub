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
      url: 'https://www.meetup.com/home/',
      description: 'Opening Meetup...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for page to load...',
    },
    // Extract groups from Next.js page data and Apollo cache
    {
      action: 'evaluate',
      script: `(async () => {
        try {
          // Strategy 1: Check __NEXT_DATA__ for embedded group data
          const nextData = window.__NEXT_DATA__;
          let groups = [];

          if (nextData) {
            // Walk the entire Next.js data tree looking for group objects with urlname
            const found = new Map();
            const walk = (obj, depth) => {
              if (!obj || depth > 10) return;
              if (typeof obj !== 'object') return;
              // A group object typically has urlname + name
              if (obj.urlname && obj.name && typeof obj.urlname === 'string' && typeof obj.name === 'string') {
                if (!found.has(obj.urlname)) {
                  found.set(obj.urlname, {
                    urlname: obj.urlname,
                    name: obj.name,
                    isOrganizer: obj.isOrganizer === true || obj.membershipMetadata?.role === 'ORGANIZER',
                  });
                }
              }
              if (Array.isArray(obj)) {
                for (const item of obj) walk(item, depth + 1);
              } else {
                for (const val of Object.values(obj)) walk(val, depth + 1);
              }
            };
            walk(nextData, 0);
            groups = Array.from(found.values());
          }

          // Strategy 2: Check Apollo Client cache (window.__APOLLO_STATE__ or similar)
          if (groups.length === 0) {
            const apolloState = window.__APOLLO_STATE__ || window.__NEXT_DATA__?.props?.pageProps?.__APOLLO_STATE__;
            if (apolloState) {
              const found = new Map();
              for (const [key, val] of Object.entries(apolloState)) {
                if (key.startsWith('Group:') && val && val.urlname) {
                  found.set(val.urlname, {
                    urlname: val.urlname,
                    name: val.name || val.urlname,
                    isOrganizer: val.isOrganizer === true,
                  });
                }
              }
              groups = Array.from(found.values());
            }
          }

          // Strategy 3: Try Meetup's internal /musearch/typeahead endpoint
          if (groups.length === 0) {
            try {
              const res = await fetch('https://www.meetup.com/mu_api/urlname-list', { credentials: 'include' });
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                  groups = data.map(g => ({ urlname: g.urlname || g, name: g.name || g.urlname || g, isOrganizer: false }));
                }
              }
            } catch {}
          }

          // Strategy 4: Extract from the page's React fiber tree
          if (groups.length === 0) {
            const rootEl = document.getElementById('__next') || document.getElementById('root');
            if (rootEl && rootEl._reactRootContainer) {
              // Can't easily traverse fiber, skip
            }
          }

          // Strategy 5: Look for group links that are NOT in nav/footer
          if (groups.length === 0) {
            const mainContent = document.querySelector('main, [role="main"], #__next > div > div:nth-child(2)') || document.body;
            const links = Array.from(mainContent.querySelectorAll('a[href*="/"]'));
            const skip = new Set(['home','groups','messages','notifications','settings','find','topics','apps','about','help','pro','login','register','account','events','blog','media','meetup','your-events','profile','members','resources','start','logout','cities','sitemap','meetup-pro','cookie-policy','terms','privacy','lp','swarm','recommended']);
            const seen = new Set();
            for (const link of links) {
              const href = link.getAttribute('href') ?? '';
              const m = href.match(/\\/([a-zA-Z][a-zA-Z0-9-]{2,})\\/?$/);
              if (!m || skip.has(m[1].toLowerCase()) || seen.has(m[1])) continue;
              // Only consider links inside the main content area, not nav/footer
              if (link.closest('nav, footer, header')) continue;
              seen.add(m[1]);
              groups.push({ urlname: m[1], name: link.textContent?.trim() || m[1], isOrganizer: false });
            }
          }

          const loggedIn = !!document.querySelector('${SELECTORS.loggedInAvatar}') || !!nextData?.props?.pageProps?.self || groups.length > 0;
          const organizer = groups.filter(g => g.isOrganizer);
          const result = organizer.length > 0 ? organizer : groups;
          return JSON.stringify({ loggedIn, groups, groupUrlname: result[0]?.urlname ?? null });
        } catch (err) {
          return JSON.stringify({ loggedIn: false, error: String(err) });
        }
      })()`,
      description: 'Finding your organizer groups...',
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

export function meetupScrapeSteps(groupUrlname: string): AutomationStep[] {
  return [
    {
      action: 'navigate',
      url: `https://www.meetup.com/${groupUrlname}/events/`,
      description: 'Opening events list...',
    },
    {
      action: 'waitForSelector',
      selector: '[data-testid="event-card"], .eventCard, a[href*="/events/"]',
      timeout: 10_000,
      description: 'Waiting for events to load...',
    },
    {
      action: 'evaluate',
      script: `(() => {
        const cards = document.querySelectorAll('[data-testid="event-card"], .eventCard--link, [id^="event-card"]');
        const events = [];
        for (const card of cards) {
          const link = card.closest('a') ?? card.querySelector('a');
          const href = link?.getAttribute('href') ?? '';
          const idMatch = href.match(/events\\/(\\d+)/);
          const title = card.querySelector('h2, h3, [data-testid="event-name"]')?.textContent?.trim() ?? '';
          const dateEl = card.querySelector('time, [datetime], [data-testid="event-date"]');
          const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
          const venue = card.querySelector('[data-testid="event-venue"], .venue-name')?.textContent?.trim() ?? '';
          const attendees = card.querySelector('[data-testid="attendee-count"], .attendee-count')?.textContent?.match(/\\d+/)?.[0];
          if (title) {
            events.push({
              externalId: idMatch ? idMatch[1] : href,
              title,
              date,
              venue,
              url: href.startsWith('http') ? href : 'https://www.meetup.com' + href,
              attendees: attendees ? parseInt(attendees) : undefined,
            });
          }
        }
        return JSON.stringify(events);
      })()`,
      description: 'Scraping event data...',
    },
  ];
}

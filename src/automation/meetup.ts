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
  // Helper script shared between home and profile page extraction
  const extractGroupsScript = `(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const groups = [];
    const seen = new Set();
    const skipPaths = new Set(['home','groups','messages','notifications','settings','find',
      'topics','apps','about','help','pro','login','register','account','events','blog',
      'media','lp','swarm','meetup','your-events','recommended','profile','members',
      'resources','cookie-policy','terms','privacy']);

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      let urlname = null;
      // Absolute: https://www.meetup.com/group-name/
      const absMatch = href.match(/meetup\\.com\\/([a-zA-Z][a-zA-Z0-9-]{2,})\\/?(?:\\?|#|$)/);
      if (absMatch) urlname = absMatch[1];
      // Relative: /group-name/
      if (!urlname) {
        const relMatch = href.match(/^\\/([a-zA-Z][a-zA-Z0-9-]{2,})\\/?(?:\\?|#|$)/);
        if (relMatch) urlname = relMatch[1];
      }
      if (!urlname || skipPaths.has(urlname.toLowerCase()) || seen.has(urlname)) continue;
      seen.add(urlname);

      const card = link.closest('[class*="card"], [class*="Card"], li, article, div[class]') ?? link;
      const name = card.querySelector('h3, h2, [class*="name"], [class*="Name"]')?.textContent?.trim()
        ?? link.textContent?.trim() ?? urlname;
      const isOrganizer = /organiz/i.test(card.textContent ?? '');
      groups.push({ urlname, name, isOrganizer });
    }

    const organizer = groups.filter(g => g.isOrganizer);
    const result = organizer.length > 0 ? organizer : groups;
    return JSON.stringify({ loggedIn: true, groups: result, groupUrlname: result[0]?.urlname ?? null });
  })()`;

  return [
    // Step 1: Go to home page and check login
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
    // Step 2: Navigate to "Your Groups" page — most reliable for finding organizer groups
    {
      action: 'navigate',
      url: 'https://www.meetup.com/find/?source=GROUPS',
      description: 'Opening your groups...',
    },
    {
      action: 'waitForSelector',
      selector: 'body',
      timeout: 10_000,
      description: 'Waiting for groups page...',
    },
    // Step 3: Extract groups from the page
    {
      action: 'evaluate',
      script: extractGroupsScript,
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

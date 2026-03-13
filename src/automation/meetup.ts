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
    {
      action: 'evaluate',
      script: `(() => {
        const avatar = document.querySelector('${SELECTORS.loggedInAvatar}');
        if (!avatar) return JSON.stringify({ loggedIn: false });
        const groupLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        const groupUrlname = groupLinks.length > 0
          ? groupLinks[0].getAttribute('href')?.match(/\\/([^\\/]+)\\/?$/)?.[1] ?? null
          : null;
        return JSON.stringify({ loggedIn: true, groupUrlname });
      })()`,
      description: 'Checking login status...',
    },
  ];
}

export function meetupPublishSteps(event: SocialiseEvent, groupUrlname: string): AutomationStep[] {
  const startDate = new Date(event.start_time);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

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
        const match = url.match(/events\\/(\\d+)/);
        return JSON.stringify({
          externalId: match ? match[1] : null,
          externalUrl: url,
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

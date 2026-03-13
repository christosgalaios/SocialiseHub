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

                const orgGroup = result.groups.find(g => g.isOrganizer);
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
    // Use GraphQL API with variables for reliable, injection-safe event data
    {
      action: 'evaluate',
      script: `(async () => {
        const resp = await fetch('https://www.meetup.com/gql2', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query($urlname: String!) { groupByUrlname(urlname: $urlname) { events(first: 50) { edges { node { id title dateTime eventUrl venue { name } } } } } }',
            variables: { urlname: ${JSON.stringify(groupUrlname)} }
          }),
        });
        if (!resp.ok) return JSON.stringify({ error: 'GraphQL returned ' + resp.status });
        const json = await resp.json();
        if (json.errors) return JSON.stringify({ error: json.errors[0]?.message ?? 'GraphQL error' });
        const edges = json?.data?.groupByUrlname?.events?.edges ?? [];
        const events = edges.map(e => ({
          externalId: e.node.id,
          title: e.node.title,
          date: e.node.dateTime,
          venue: e.node.venue?.name ?? '',
          url: e.node.eventUrl,
        }));
        return JSON.stringify(events);
      })()`,
      description: 'Fetching events via API...',
    },
  ];
}

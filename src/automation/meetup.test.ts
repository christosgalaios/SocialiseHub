import { describe, it, expect } from 'vitest';
import { meetupConnectSteps, meetupPublishSteps, meetupScrapeSteps } from './meetup.js';
import type { SocialiseEvent } from '../shared/types.js';

describe('meetupConnectSteps', () => {
  it('returns steps starting with navigate to meetup.com', () => {
    const steps = meetupConnectSteps();
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].url).toContain('meetup.com');
  });

  it('includes an evaluate step to check login status', () => {
    const steps = meetupConnectSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('loggedIn');
  });

  it('all steps have descriptions', () => {
    const steps = meetupConnectSteps();
    for (const step of steps) {
      expect(step.description).toBeTruthy();
    }
  });
});

const mockEvent: SocialiseEvent = {
  id: '1',
  title: 'Test Event',
  description: 'A test event description',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'Test Venue',
  price: 0,
  capacity: 50,
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('meetupPublishSteps', () => {
  it('navigates to the group create-event page', () => {
    const steps = meetupPublishSteps(mockEvent, 'socialise-bristol');
    expect(steps[0].url).toContain('socialise-bristol/events/create');
  });

  it('fills the title', () => {
    const steps = meetupPublishSteps(mockEvent, 'socialise-bristol');
    const fillTitle = steps.find(s => s.action === 'fill' && s.description.includes('title'));
    expect(fillTitle).toBeDefined();
    expect(fillTitle!.value).toBe('Test Event');
  });

  it('ends with an evaluate step that extracts the event ID', () => {
    const steps = meetupPublishSteps(mockEvent, 'socialise-bristol');
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('evaluate');
    expect(lastStep.script).toContain('externalId');
  });
});

describe('meetupScrapeSteps', () => {
  it('navigates to the group events page', () => {
    const steps = meetupScrapeSteps('socialise-bristol');
    expect(steps[0].url).toContain('socialise-bristol/events');
  });

  it('includes an evaluate step that extracts event data', () => {
    const steps = meetupScrapeSteps('socialise-bristol');
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('externalId');
    expect(evalStep!.script).toContain('title');
  });
});

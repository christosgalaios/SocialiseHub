// src/automation/eventbrite.test.ts
import { describe, it, expect } from 'vitest';
import { eventbriteConnectSteps, eventbritePublishSteps, eventbriteScrapeSteps } from './eventbrite.js';
import type { SocialiseEvent } from '../shared/types.js';

const mockEvent: SocialiseEvent = {
  id: '1',
  title: 'Test Event',
  description: 'A test description',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'Test Venue',
  price: 0,
  capacity: 100,
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('eventbriteConnectSteps', () => {
  it('navigates to eventbrite.com', () => {
    const steps = eventbriteConnectSteps();
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].url).toContain('eventbrite.co.uk');
  });

  it('includes evaluate step checking login', () => {
    const steps = eventbriteConnectSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('loggedIn');
  });

  it('all steps have descriptions', () => {
    for (const step of eventbriteConnectSteps()) {
      expect(step.description).toBeTruthy();
    }
  });
});

describe('eventbritePublishSteps', () => {
  it('navigates to eventbrite.co.uk/manage/events/create', () => {
    const steps = eventbritePublishSteps(mockEvent);
    expect(steps[0].url).toContain('eventbrite.co.uk/manage/events/create');
  });

  it('fills the title', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const fillTitle = steps.find(s => s.action === 'fill' && s.description.includes('title'));
    expect(fillTitle).toBeDefined();
    expect(fillTitle!.value).toBe('Test Event');
  });

  it('uses 15s timeout for form load', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const waitStep = steps.find(s => s.action === 'waitForSelector');
    expect(waitStep!.timeout).toBe(15_000);
  });

  it('fills summary and description', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const summaryStep = steps.find(s => s.description.includes('summary'));
    const descStep = steps.find(s => s.description.includes('description'));
    expect(summaryStep).toBeDefined();
    expect(descStep).toBeDefined();
  });

  it('ends with evaluate extracting event ID', () => {
    const steps = eventbritePublishSteps(mockEvent);
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('evaluate');
    expect(lastStep.script).toContain('externalId');
  });
});

describe('eventbriteScrapeSteps', () => {
  it('navigates to organizations events page', () => {
    const steps = eventbriteScrapeSteps();
    expect(steps[0].url).toContain('organizations/home');
  });

  it('includes evaluate extracting event data', () => {
    const steps = eventbriteScrapeSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('externalId');
    expect(evalStep!.script).toContain('title');
  });
});

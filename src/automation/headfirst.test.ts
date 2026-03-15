// src/automation/headfirst.test.ts
import { describe, it, expect } from 'vitest';
import { headfirstConnectSteps, headfirstPublishSteps, headfirstScrapeSteps } from './headfirst.js';
import type { SocialiseEvent } from '../shared/types.js';

const mockEvent: SocialiseEvent = {
  id: '1',
  title: 'Test Event',
  description: 'A test description',
  start_time: '2026-04-01T19:00:00Z',
  duration_minutes: 120,
  venue: 'The Lanes',
  price: 5,
  capacity: 50,
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('headfirstConnectSteps', () => {
  it('navigates to headfirstbristol.co.uk', () => {
    const steps = headfirstConnectSteps();
    expect(steps[0].action).toBe('navigate');
    expect(steps[0].url).toContain('headfirstbristol.co.uk');
  });

  it('includes evaluate step checking login', () => {
    const steps = headfirstConnectSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('loggedIn');
  });

  it('all steps have descriptions', () => {
    for (const step of headfirstConnectSteps()) {
      expect(step.description).toBeTruthy();
    }
  });
});

describe('headfirstPublishSteps', () => {
  it('navigates to event manager', () => {
    const steps = headfirstPublishSteps(mockEvent);
    expect(steps[0].url).toContain('event-manager');
  });

  it('clicks Create Event button', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const clickStep = steps.find(s => s.action === 'click' && s.description.includes('Create Event'));
    expect(clickStep).toBeDefined();
  });

  it('fills title on editor page', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const fillTitle = steps.find(s => s.action === 'fill' && s.description.includes('title'));
    expect(fillTitle).toBeDefined();
    expect(fillTitle!.value).toBe('Test Event');
  });

  it('handles venue with combobox', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const venueStep = steps.find(s => s.description.includes('venue'));
    expect(venueStep).toBeDefined();
  });

  it('ends with evaluate extracting event ID', () => {
    const steps = headfirstPublishSteps(mockEvent);
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('evaluate');
    expect(lastStep.script).toContain('externalId');
  });
});

describe('headfirstScrapeSteps', () => {
  it('navigates to my-events page', () => {
    const steps = headfirstScrapeSteps();
    expect(steps[0].url).toContain('event-manager');
  });

  it('includes evaluate extracting event data', () => {
    const steps = headfirstScrapeSteps();
    const evalStep = steps.find(s => s.action === 'evaluate');
    expect(evalStep).toBeDefined();
    expect(evalStep!.script).toContain('externalId');
    expect(evalStep!.script).toContain('title');
  });
});

import { describe, it, expect } from 'vitest';
import { checkEventReadiness, isReadyToPublish } from './event-readiness.js';
import type { SocialiseEvent } from '../shared/types.js';

const completeEvent: SocialiseEvent = {
  id: '1',
  title: 'Bristol Frog Walk',
  description: 'A guided evening walk to discover frogs and amphibians in their natural habitat. Bring a torch and wear wellies! We will explore ponds and wetlands around the nature reserve.',
  start_time: '2027-06-15T19:00:00Z',
  duration_minutes: 120,
  venue: 'Stoke Park Estate',
  price: 10,
  capacity: 30,
  imageUrl: 'https://example.com/frog.jpg',
  status: 'draft',
  platforms: [],
  createdAt: '2026-03-13T00:00:00Z',
  updatedAt: '2026-03-13T00:00:00Z',
};

describe('checkEventReadiness', () => {
  it('a complete event passes all checks', () => {
    const checks = checkEventReadiness(completeEvent);
    expect(checks.every(c => c.passed)).toBe(true);
  });

  it('an event missing title fails the title check', () => {
    const event = { ...completeEvent, title: '' };
    const checks = checkEventReadiness(event);
    const titleCheck = checks.find(c => c.field === 'title');
    expect(titleCheck!.passed).toBe(false);
  });

  it('a short title fails the title check', () => {
    const event = { ...completeEvent, title: 'Hi' };
    const checks = checkEventReadiness(event);
    const titleCheck = checks.find(c => c.field === 'title');
    expect(titleCheck!.passed).toBe(false);
  });

  it('a short description fails the description check', () => {
    const event = { ...completeEvent, description: 'Too short' };
    const checks = checkEventReadiness(event);
    const descCheck = checks.find(c => c.field === 'description');
    expect(descCheck!.passed).toBe(false);
  });

  it('missing venue fails the venue check', () => {
    const event = { ...completeEvent, venue: '' };
    const checks = checkEventReadiness(event);
    const venueCheck = checks.find(c => c.field === 'venue');
    expect(venueCheck!.passed).toBe(false);
  });
});

describe('isReadyToPublish', () => {
  it('returns true when all required checks pass', () => {
    const checks = checkEventReadiness(completeEvent);
    expect(isReadyToPublish(checks)).toBe(true);
  });

  it('returns false if any required check fails', () => {
    const event = { ...completeEvent, title: '' };
    const checks = checkEventReadiness(event);
    expect(isReadyToPublish(checks)).toBe(false);
  });

  it('returns true even if recommended checks fail', () => {
    const event = { ...completeEvent, imageUrl: undefined, capacity: 0 };
    const checks = checkEventReadiness(event);
    expect(isReadyToPublish(checks)).toBe(true);
  });
});

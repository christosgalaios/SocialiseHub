import type { SocialiseEvent } from '../shared/types.js';

export interface ReadinessCheck {
  field: string;
  label: string;
  passed: boolean;
  severity: 'required' | 'recommended';
}

export function checkEventReadiness(event: SocialiseEvent): ReadinessCheck[] {
  const now = new Date();
  return [
    { field: 'title', label: 'Title', passed: !!event.title && event.title.length >= 5, severity: 'required' },
    { field: 'description', label: 'Description', passed: !!event.description && event.description.length >= 20, severity: 'required' },
    { field: 'start_time', label: 'Start date', passed: !!event.start_time && new Date(event.start_time) > now, severity: 'required' },
    { field: 'venue', label: 'Venue', passed: !!event.venue, severity: 'required' },
    { field: 'price', label: 'Price set', passed: event.price !== undefined && event.price !== null, severity: 'recommended' },
    { field: 'capacity', label: 'Capacity set', passed: !!event.capacity && event.capacity > 0, severity: 'recommended' },
    { field: 'description_length', label: 'Description 100+ chars', passed: !!event.description && event.description.length >= 100, severity: 'recommended' },
  ];
}

export function isReadyToPublish(checks: ReadinessCheck[]): boolean {
  return checks.filter(c => c.severity === 'required').every(c => c.passed);
}

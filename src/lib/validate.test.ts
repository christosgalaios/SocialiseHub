import { describe, it, expect } from 'vitest';
import { validateCreateEventInput } from './validate.js';

describe('validateCreateEventInput', () => {
  const validInput = {
    title: 'Test Event',
    description: 'A test',
    start_time: '2026-04-15T19:00:00Z',
    venue: 'The Venue',
    price: 10,
    capacity: 50,
  };

  it('passes valid input', () => {
    const result = validateCreateEventInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on missing title', () => {
    const result = validateCreateEventInput({ ...validInput, title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title is required');
  });

  it('fails on negative price', () => {
    const result = validateCreateEventInput({ ...validInput, price: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('price must be 0 or greater');
  });

  it('fails on zero capacity', () => {
    const result = validateCreateEventInput({ ...validInput, capacity: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('capacity must be at least 1');
  });

  it('collects multiple errors', () => {
    const result = validateCreateEventInput({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

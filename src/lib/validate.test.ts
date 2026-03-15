import { describe, it, expect } from 'vitest';
import { validateCreateEventInput, validateUpdateEventInput } from './validate.js';

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

  // ── Date format validation ───────────────────────────────

  it('fails on invalid start_time format', () => {
    const result = validateCreateEventInput({
      ...validInput,
      start_time: 'not-a-date',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'start_time must be a valid ISO 8601 date string',
    );
  });

  it('passes with a valid ISO 8601 start_time', () => {
    const result = validateCreateEventInput({
      ...validInput,
      start_time: '2026-06-01T10:00:00.000Z',
    });
    expect(result.valid).toBe(true);
  });

  // ── End time after start time ────────────────────────────

  it('passes when end_time is after start_time', () => {
    const result = validateCreateEventInput({
      ...validInput,
      end_time: '2026-04-15T21:00:00Z',
    });
    expect(result.valid).toBe(true);
  });

  it('fails when end_time equals start_time', () => {
    const result = validateCreateEventInput({
      ...validInput,
      end_time: '2026-04-15T19:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('end_time must be after start_time');
  });

  it('fails when end_time is before start_time', () => {
    const result = validateCreateEventInput({
      ...validInput,
      end_time: '2026-04-15T18:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('end_time must be after start_time');
  });

  it('fails when end_time is an invalid date string', () => {
    const result = validateCreateEventInput({
      ...validInput,
      end_time: 'bad-date',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'end_time must be a valid ISO 8601 date string',
    );
  });

  it('passes without end_time (it is optional)', () => {
    const { ...inputWithoutEnd } = validInput;
    const result = validateCreateEventInput(inputWithoutEnd);
    expect(result.valid).toBe(true);
  });

  // ── Duration validation ──────────────────────────────────

  it('passes with a valid duration_minutes', () => {
    const result = validateCreateEventInput({
      ...validInput,
      duration_minutes: 90,
    });
    expect(result.valid).toBe(true);
  });

  it('passes with duration_minutes at boundary values (1 and 1440)', () => {
    expect(
      validateCreateEventInput({ ...validInput, duration_minutes: 1 }).valid,
    ).toBe(true);
    expect(
      validateCreateEventInput({ ...validInput, duration_minutes: 1440 }).valid,
    ).toBe(true);
  });

  it('fails when duration_minutes is 0', () => {
    const result = validateCreateEventInput({
      ...validInput,
      duration_minutes: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('duration_minutes must be a positive number');
  });

  it('fails when duration_minutes is negative', () => {
    const result = validateCreateEventInput({
      ...validInput,
      duration_minutes: -30,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('duration_minutes must be a positive number');
  });

  it('fails when duration_minutes exceeds 1440', () => {
    const result = validateCreateEventInput({
      ...validInput,
      duration_minutes: 1441,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'duration_minutes must be 1440 or fewer (max 24 hours)',
    );
  });

  it('passes without duration_minutes (it is optional)', () => {
    const result = validateCreateEventInput(validInput);
    expect(result.valid).toBe(true);
  });

  // ── Title length ─────────────────────────────────────────

  it('passes with a title of exactly 200 characters', () => {
    const result = validateCreateEventInput({
      ...validInput,
      title: 'a'.repeat(200),
    });
    expect(result.valid).toBe(true);
  });

  it('fails when title exceeds 200 characters', () => {
    const result = validateCreateEventInput({
      ...validInput,
      title: 'a'.repeat(201),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title must be 200 characters or fewer');
  });

  it('fails when title is only whitespace', () => {
    const result = validateCreateEventInput({ ...validInput, title: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title is required');
  });

  // ── Capacity upper bound ─────────────────────────────────

  it('passes with capacity at the upper bound (10000)', () => {
    const result = validateCreateEventInput({
      ...validInput,
      capacity: 10000,
    });
    expect(result.valid).toBe(true);
  });

  it('fails when capacity exceeds 10000', () => {
    const result = validateCreateEventInput({
      ...validInput,
      capacity: 10001,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('capacity must be 10000 or fewer');
  });

  // ── Description / Venue length ──────────────────────────

  it('fails when description exceeds 5000 characters', () => {
    const result = validateCreateEventInput({
      ...validInput,
      description: 'D'.repeat(5001),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('description must be 5000 characters or fewer');
  });

  it('fails when venue exceeds 500 characters', () => {
    const result = validateCreateEventInput({
      ...validInput,
      venue: 'V'.repeat(501),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('venue must be 500 characters or fewer');
  });
});

describe('validateUpdateEventInput', () => {
  it('passes with empty input (no fields to validate)', () => {
    const result = validateUpdateEventInput({});
    expect(result.valid).toBe(true);
  });

  it('passes with valid partial fields', () => {
    const result = validateUpdateEventInput({ title: 'New Title', price: 5 });
    expect(result.valid).toBe(true);
  });

  it('rejects empty title', () => {
    const result = validateUpdateEventInput({ title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title must be a non-empty string');
  });

  it('rejects title over 200 chars', () => {
    const result = validateUpdateEventInput({ title: 'a'.repeat(201) });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title must be 200 characters or fewer');
  });

  it('rejects invalid start_time', () => {
    const result = validateUpdateEventInput({ start_time: 'not-a-date' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('start_time must be a valid ISO date');
  });

  it('rejects negative price', () => {
    const result = validateUpdateEventInput({ price: -5 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('price must be 0 or greater');
  });

  it('rejects capacity over 10000', () => {
    const result = validateUpdateEventInput({ capacity: 10001 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('capacity must be between 1 and 10000');
  });

  it('rejects duration_minutes over 1440', () => {
    const result = validateUpdateEventInput({ duration_minutes: 2000 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('duration_minutes must be between 1 and 1440');
  });

  it('rejects end_time before start_time when both provided', () => {
    const result = validateUpdateEventInput({
      start_time: '2030-06-01T19:00:00Z',
      end_time: '2030-06-01T17:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('end_time must be after start_time');
  });

  it('accepts end_time after start_time when both provided', () => {
    const result = validateUpdateEventInput({
      start_time: '2030-06-01T17:00:00Z',
      end_time: '2030-06-01T19:00:00Z',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid end_time format', () => {
    const result = validateUpdateEventInput({ end_time: 'not-a-date' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('end_time must be a valid ISO date');
  });

  it('rejects description over 5000 characters', () => {
    const result = validateUpdateEventInput({ description: 'A'.repeat(5001) });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('description must be 5000 characters or fewer');
  });

  it('allows description up to 5000 characters', () => {
    const result = validateUpdateEventInput({ description: 'A'.repeat(5000) });
    expect(result.valid).toBe(true);
  });

  it('rejects venue over 500 characters', () => {
    const result = validateUpdateEventInput({ venue: 'V'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('venue must be 500 characters or fewer');
  });

  it('rejects category over 100 characters', () => {
    const result = validateUpdateEventInput({ category: 'C'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('category must be 100 characters or fewer');
  });
});

import type { CreateEventInput } from '../shared/types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateEventInput(
  input: Partial<CreateEventInput>,
): ValidationResult {
  const errors: string[] = [];

  // Title: required, 1–200 characters after trim
  const trimmedTitle = input.title?.trim() ?? '';
  if (!trimmedTitle) {
    errors.push('title is required');
  } else if (trimmedTitle.length > 200) {
    errors.push('title must be 200 characters or fewer');
  }

  if (!input.description?.trim()) errors.push('description is required');
  if (!input.venue?.trim()) errors.push('venue is required');

  if (input.price == null || input.price < 0)
    errors.push('price must be 0 or greater');

  // Capacity: required, 1–10000
  if (!input.capacity || input.capacity < 1) {
    errors.push('capacity must be at least 1');
  } else if (input.capacity > 10000) {
    errors.push('capacity must be 10000 or fewer');
  }

  // start_time: required and must be a valid ISO 8601 date
  if (!input.start_time?.trim()) {
    errors.push('start_time is required');
  } else {
    const startDate = new Date(input.start_time);
    if (isNaN(startDate.getTime())) {
      errors.push('start_time must be a valid ISO 8601 date string');
    } else if (input.end_time !== undefined) {
      // end_time: if provided, must be after start_time
      const endDate = new Date(input.end_time);
      if (isNaN(endDate.getTime())) {
        errors.push('end_time must be a valid ISO 8601 date string');
      } else if (endDate <= startDate) {
        errors.push('end_time must be after start_time');
      }
    }
  }

  // duration_minutes: if provided, must be a positive integer in range 1–1440
  if (input.duration_minutes !== undefined) {
    if (
      !Number.isFinite(input.duration_minutes) ||
      input.duration_minutes < 1
    ) {
      errors.push('duration_minutes must be a positive number');
    } else if (input.duration_minutes > 1440) {
      errors.push('duration_minutes must be 1440 or fewer (max 24 hours)');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateUpdateEventInput(
  input: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  if ('title' in input) {
    if (typeof input.title !== 'string' || !input.title.trim()) {
      errors.push('title must be a non-empty string');
    } else if (input.title.length > 200) {
      errors.push('title must be 200 characters or fewer');
    }
  }

  if ('start_time' in input) {
    if (typeof input.start_time !== 'string' || isNaN(Date.parse(input.start_time))) {
      errors.push('start_time must be a valid ISO date');
    }
  }

  if ('end_time' in input) {
    if (typeof input.end_time !== 'string' || isNaN(Date.parse(input.end_time))) {
      errors.push('end_time must be a valid ISO date');
    }
  }

  // Cross-field: end_time must be after start_time when both are provided
  if ('start_time' in input && 'end_time' in input &&
      typeof input.start_time === 'string' && typeof input.end_time === 'string') {
    const s = Date.parse(input.start_time as string);
    const e = Date.parse(input.end_time as string);
    if (!isNaN(s) && !isNaN(e) && e <= s) {
      errors.push('end_time must be after start_time');
    }
  }

  if ('price' in input) {
    if (typeof input.price !== 'number' || input.price < 0) {
      errors.push('price must be 0 or greater');
    }
  }

  if ('capacity' in input) {
    if (typeof input.capacity !== 'number' || input.capacity < 1 || input.capacity > 10000) {
      errors.push('capacity must be between 1 and 10000');
    }
  }

  if ('duration_minutes' in input) {
    if (typeof input.duration_minutes !== 'number' || input.duration_minutes < 1 || input.duration_minutes > 1440) {
      errors.push('duration_minutes must be between 1 and 1440');
    }
  }

  return { valid: errors.length === 0, errors };
}

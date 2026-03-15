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

  if (!input.description?.trim()) {
    errors.push('description is required');
  } else if (input.description!.length > 5000) {
    errors.push('description must be 5000 characters or fewer');
  }

  if (!input.venue?.trim()) {
    errors.push('venue is required');
  } else if (input.venue!.length > 500) {
    errors.push('venue must be 500 characters or fewer');
  }

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

  if (input.short_description !== undefined && typeof input.short_description === 'string' && input.short_description.length > 300) {
    errors.push('short_description must be at most 300 characters');
  }
  if (input.age_restriction !== undefined && typeof input.age_restriction === 'string' && input.age_restriction.length > 50) {
    errors.push('age_restriction must be at most 50 characters');
  }
  if (input.event_type !== undefined && !['in_person', 'online', 'hybrid'].includes(input.event_type as string)) {
    errors.push('event_type must be in_person, online, or hybrid');
  }
  if (input.online_url !== undefined && typeof input.online_url === 'string' && input.online_url.length > 500) {
    errors.push('online_url must be at most 500 characters');
  }
  if (input.parking_info !== undefined && typeof input.parking_info === 'string' && input.parking_info.length > 1000) {
    errors.push('parking_info must be at most 1000 characters');
  }
  if (input.refund_policy !== undefined && typeof input.refund_policy === 'string' && input.refund_policy.length > 1000) {
    errors.push('refund_policy must be at most 1000 characters');
  }
  if (input.allow_guests !== undefined && input.allow_guests !== null) {
    const g = Number(input.allow_guests);
    if (!Number.isInteger(g) || g < 0 || g > 5) {
      errors.push('allow_guests must be an integer between 0 and 5');
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

  if ('description' in input) {
    if (typeof input.description === 'string' && input.description.length > 5000) {
      errors.push('description must be 5000 characters or fewer');
    }
  }

  if ('venue' in input) {
    if (typeof input.venue === 'string' && input.venue.length > 500) {
      errors.push('venue must be 500 characters or fewer');
    }
  }

  if ('category' in input) {
    if (typeof input.category === 'string' && input.category.length > 100) {
      errors.push('category must be 100 characters or fewer');
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

  if ('actual_attendance' in input && input.actual_attendance != null) {
    if (typeof input.actual_attendance !== 'number' || input.actual_attendance < 0 || !Number.isInteger(input.actual_attendance)) {
      errors.push('actual_attendance must be a non-negative integer');
    }
  }

  if ('actual_revenue' in input && input.actual_revenue != null) {
    if (typeof input.actual_revenue !== 'number' || input.actual_revenue < 0) {
      errors.push('actual_revenue must be 0 or greater');
    }
  }

  if ('short_description' in input) {
    if (typeof input.short_description === 'string' && input.short_description.length > 300) {
      errors.push('short_description must be at most 300 characters');
    }
  }
  if ('age_restriction' in input) {
    if (typeof input.age_restriction === 'string' && input.age_restriction.length > 50) {
      errors.push('age_restriction must be at most 50 characters');
    }
  }
  if ('event_type' in input && input.event_type != null) {
    if (!['in_person', 'online', 'hybrid'].includes(input.event_type as string)) {
      errors.push('event_type must be in_person, online, or hybrid');
    }
  }
  if ('online_url' in input) {
    if (typeof input.online_url === 'string' && input.online_url.length > 500) {
      errors.push('online_url must be at most 500 characters');
    }
  }
  if ('parking_info' in input) {
    if (typeof input.parking_info === 'string' && input.parking_info.length > 1000) {
      errors.push('parking_info must be at most 1000 characters');
    }
  }
  if ('refund_policy' in input) {
    if (typeof input.refund_policy === 'string' && input.refund_policy.length > 1000) {
      errors.push('refund_policy must be at most 1000 characters');
    }
  }
  if ('allow_guests' in input && input.allow_guests != null) {
    const g = Number(input.allow_guests);
    if (!Number.isInteger(g) || g < 0 || g > 5) {
      errors.push('allow_guests must be an integer between 0 and 5');
    }
  }

  return { valid: errors.length === 0, errors };
}

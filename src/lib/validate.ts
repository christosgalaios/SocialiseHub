import type { CreateEventInput } from '../shared/types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateEventInput(
  input: Partial<CreateEventInput>,
): ValidationResult {
  const errors: string[] = [];

  if (!input.title?.trim()) errors.push('title is required');
  if (!input.description?.trim()) errors.push('description is required');
  if (!input.start_time?.trim()) errors.push('start_time is required');
  if (!input.venue?.trim()) errors.push('venue is required');
  if (input.price == null || input.price < 0)
    errors.push('price must be 0 or greater');
  if (!input.capacity || input.capacity < 1)
    errors.push('capacity must be at least 1');

  return { valid: errors.length === 0, errors };
}

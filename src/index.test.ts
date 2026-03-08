import { describe, it, expect } from 'vitest';
import { VERSION, main } from './index.js';

describe('Socialise Hub', () => {
  it('exports a version string', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('main runs without error', () => {
    expect(() => main()).not.toThrow();
  });
});

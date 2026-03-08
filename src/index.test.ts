import { describe, it, expect } from 'vitest';
import { VERSION, PORT } from './index.js';

describe('SocialiseHub', () => {
  it('exports a version string', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports a default port', () => {
    expect(PORT).toBe(3000);
  });
});

import { describe, it, expect } from 'vitest';

describe('Admin Test Infrastructure', () => {
  it('should have jsdom environment', () => {
    expect(typeof window).toBe('object');
  });

  it('should have localStorage mock available', () => {
    expect(typeof localStorage).toBe('object');
  });
});

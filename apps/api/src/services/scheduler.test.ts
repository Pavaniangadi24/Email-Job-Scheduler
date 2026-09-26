import { describe, expect, it } from 'vitest';
import { normalizeRecipients, scheduledTime } from './scheduler-helpers';

describe('scheduler helpers', () => {
  it('normalizes and deduplicates recipient addresses', () => {
    expect(normalizeRecipients([' Sam@Example.com ', 'sam@example.com', 'lee@example.com'])).toEqual(['sam@example.com', 'lee@example.com']);
  });

  it('places each recipient at the configured campaign interval', () => {
    const startAt = new Date('2026-10-01T12:00:00.000Z');
    expect(scheduledTime(startAt, 3, 5000).toISOString()).toBe('2026-10-01T12:00:15.000Z');
  });
});
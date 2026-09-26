import { describe, expect, it } from 'vitest';
import { extractRecipients } from './recipients';

describe('extractRecipients', () => {
  it('finds distinct email addresses in CSV or plain text', () => {
    expect(extractRecipients('Email,Name\nSAM@example.com,Sam\n sam@example.com \nnot-an-email')).toEqual(['sam@example.com']);
  });

  it('returns no addresses for empty input', () => {
    expect(extractRecipients('')).toEqual([]);
  });
});
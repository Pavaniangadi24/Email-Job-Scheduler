import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret';

describe('Slack secret encryption', () => {
  it('round-trips tokens using authenticated encryption', () => {
    const value = 'xoxb-test-token-not-a-real-credential';
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it('rejects modified ciphertext', () => {
    const encrypted = encryptSecret('private-webhook');
    const parts = encrypted.split(':');
    parts[3] = `${parts[3].slice(0, -2)}00`;
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
});
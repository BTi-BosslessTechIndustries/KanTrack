/**
 * Tests for crypto.js — WebCrypto-based encrypt/decrypt + hash.
 * crypto.subtle is available natively in Node 18+ (Vitest runtime).
 */
import { describe, it, expect } from 'vitest';
import {
  encryptWorkspace,
  decryptWorkspace,
  computeHash,
} from '../scripts/kantrack-modules/crypto.js';

// ---------------------------------------------------------------------------
// encryptWorkspace / decryptWorkspace — round-trip
// ---------------------------------------------------------------------------

describe('encryptWorkspace / decryptWorkspace — round-trip', () => {
  it('decrypts back to the original string', async () => {
    const original = JSON.stringify({ hello: 'world', tasks: [1, 2, 3] });
    const buf = await encryptWorkspace(original, 'my-secret');
    const result = await decryptWorkspace(buf, 'my-secret');
    expect(result).toBe(original);
  });

  it('round-trips an empty string', async () => {
    const buf = await encryptWorkspace('', 'pass');
    expect(await decryptWorkspace(buf, 'pass')).toBe('');
  });

  it('round-trips a large payload', async () => {
    const large = JSON.stringify({ data: 'x'.repeat(100_000) });
    const buf = await encryptWorkspace(large, 'big-secret');
    expect(await decryptWorkspace(buf, 'big-secret')).toBe(large);
  });

  it('produces an ArrayBuffer', async () => {
    const buf = await encryptWorkspace('test', 'pass');
    expect(buf).toBeInstanceOf(ArrayBuffer);
  });

  it('encrypted buffer is larger than the plaintext (header + ciphertext overhead)', async () => {
    const text = 'hello';
    const buf = await encryptWorkspace(text, 'pass');
    expect(buf.byteLength).toBeGreaterThan(text.length);
  });
});

// ---------------------------------------------------------------------------
// decryptWorkspace — wrong passphrase
// ---------------------------------------------------------------------------

describe('decryptWorkspace — wrong passphrase', () => {
  it('throws when the passphrase is wrong', async () => {
    const buf = await encryptWorkspace('secret data', 'correct-pass');
    await expect(decryptWorkspace(buf, 'wrong-pass')).rejects.toThrow();
  });

  it('throws when given a truncated buffer', async () => {
    const buf = await encryptWorkspace('data', 'pass');
    const truncated = buf.slice(0, 10); // chop off the ciphertext
    await expect(decryptWorkspace(truncated, 'pass')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// encryptWorkspace — ciphertext uniqueness
// ---------------------------------------------------------------------------

describe('encryptWorkspace — unique ciphertexts', () => {
  it('encrypting the same plaintext twice produces different bytes (random salt + IV)', async () => {
    const text = 'same plaintext';
    const buf1 = await encryptWorkspace(text, 'pass');
    const buf2 = await encryptWorkspace(text, 'pass');
    const a1 = new Uint8Array(buf1);
    const a2 = new Uint8Array(buf2);
    // At least one byte should differ (overwhelmingly likely with random 16B salt + 12B IV)
    let anyDiffers = false;
    for (let i = 0; i < Math.min(a1.length, a2.length); i++) {
      if (a1[i] !== a2[i]) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeHash
// ---------------------------------------------------------------------------

describe('computeHash', () => {
  it('returns a non-empty hex string', async () => {
    const hash = await computeHash([{ id: 'task-1' }]);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('same input produces the same hash (deterministic)', async () => {
    const data = [{ id: 'task-1', title: 'Hello' }];
    const h1 = await computeHash(data);
    const h2 = await computeHash(data);
    expect(h1).toBe(h2);
  });

  it('different inputs produce different hashes', async () => {
    const h1 = await computeHash([{ id: 'a' }]);
    const h2 = await computeHash([{ id: 'b' }]);
    expect(h1).not.toBe(h2);
  });

  it('produces a 64-character SHA-256 hex string', async () => {
    const hash = await computeHash('anything');
    expect(hash).toHaveLength(64);
  });
});

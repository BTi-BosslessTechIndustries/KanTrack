/***********************
 * CRYPTO — WebCrypto-based workspace encryption
 * No external library. Uses PBKDF2 + AES-GCM.
 *
 * Binary format for encrypted files:
 *   salt [16 bytes] + iv [12 bytes] + AES-GCM ciphertext
 ***********************/

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Derive an AES-GCM-256 key from a passphrase and salt using PBKDF2.
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
async function _deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a JSON string with a passphrase.
 * Returns an ArrayBuffer: salt[16] + iv[12] + ciphertext.
 * @param {string} jsonString
 * @param {string} passphrase
 * @returns {Promise<ArrayBuffer>}
 */
export async function encryptWorkspace(jsonString, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await _deriveKey(passphrase, salt);
  const encoded = new TextEncoder().encode(jsonString);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const result = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
  return result.buffer;
}

/**
 * Decrypt an ArrayBuffer (produced by encryptWorkspace) using the passphrase.
 * Throws if the passphrase is wrong or the data is corrupted (AES-GCM auth fails).
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} passphrase
 * @returns {Promise<string>} — the original JSON string
 */
export async function decryptWorkspace(arrayBuffer, passphrase) {
  const data = new Uint8Array(arrayBuffer);
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH);
  const key = await _deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/**
 * Compute a SHA-256 hex digest of JSON.stringify(data).
 * Used to populate the integrity.tasks_hash field in exports.
 * @param {unknown} data
 * @returns {Promise<string>} — lowercase hex string
 */
export async function computeHash(data) {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

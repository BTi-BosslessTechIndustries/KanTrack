/***********************
 * CRYPTO — WebCrypto-based workspace encryption
 * No external library. Uses PBKDF2 + AES-GCM.
 *
 * Binary format for encrypted files (v1+):
 *   magic  [5 bytes]  = 0x4B 0x54 0x45 0x4E 0x43  ("KTENC")
 *   version[1 byte]   = format version (1 = PBKDF2-SHA256/100k, 2 = PBKDF2-SHA256/600k)
 *   salt   [16 bytes]
 *   iv     [12 bytes]
 *   AES-GCM ciphertext
 *
 * Legacy format (no magic prefix, produced before this version byte was added):
 *   salt [16 bytes] + iv [12 bytes] + AES-GCM ciphertext
 *   Assumed version 0 (PBKDF2-SHA256, 100k iterations).
 ***********************/

// Magic bytes: "KTENC"
const MAGIC = new Uint8Array([0x4b, 0x54, 0x45, 0x4e, 0x43]);
const CURRENT_VERSION = 2; // version 2 = PBKDF2-SHA256, 600k iterations
const HEADER_SIZE = MAGIC.length + 1; // 6 bytes

const PBKDF2_ITERATIONS_V1 = 100_000; // legacy (v0 and v1)
const PBKDF2_ITERATIONS_V2 = 600_000; // OWASP 2024 recommendation
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function _iterationsForVersion(version) {
  return version >= 2 ? PBKDF2_ITERATIONS_V2 : PBKDF2_ITERATIONS_V1;
}

/**
 * Derive an AES-GCM-256 key from a passphrase and salt using PBKDF2.
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
async function _deriveKey(passphrase, salt, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a JSON string with a passphrase.
 * Returns an ArrayBuffer: magic[5] + version[1] + salt[16] + iv[12] + ciphertext.
 * @param {string} jsonString
 * @param {string} passphrase
 * @returns {Promise<ArrayBuffer>}
 */
export async function encryptWorkspace(jsonString, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const iterations = _iterationsForVersion(CURRENT_VERSION);
  const key = await _deriveKey(passphrase, salt, iterations);
  const encoded = new TextEncoder().encode(jsonString);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const result = new Uint8Array(HEADER_SIZE + SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  result.set(MAGIC, 0);
  result[MAGIC.length] = CURRENT_VERSION;
  result.set(salt, HEADER_SIZE);
  result.set(iv, HEADER_SIZE + SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), HEADER_SIZE + SALT_LENGTH + IV_LENGTH);
  return result.buffer;
}

/**
 * Decrypt an ArrayBuffer (produced by encryptWorkspace or legacy encryptWorkspace) using the passphrase.
 * Automatically detects v0 (legacy) vs v1+ (with magic header).
 * Throws if the passphrase is wrong or the data is corrupted (AES-GCM auth fails).
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} passphrase
 * @returns {Promise<string>} — the original JSON string
 */
export async function decryptWorkspace(arrayBuffer, passphrase) {
  const data = new Uint8Array(arrayBuffer);

  let version = 0;
  let offset = 0;

  // Detect new format by magic prefix
  if (
    data.length >= HEADER_SIZE &&
    data[0] === MAGIC[0] &&
    data[1] === MAGIC[1] &&
    data[2] === MAGIC[2] &&
    data[3] === MAGIC[3] &&
    data[4] === MAGIC[4]
  ) {
    version = data[MAGIC.length];
    offset = HEADER_SIZE;
  }

  const salt = data.slice(offset, offset + SALT_LENGTH);
  const iv = data.slice(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.slice(offset + SALT_LENGTH + IV_LENGTH);
  const iterations = _iterationsForVersion(version);
  const key = await _deriveKey(passphrase, salt, iterations);
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

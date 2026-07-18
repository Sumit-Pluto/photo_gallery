/**
 * Lightweight password hashing for the client-side album lock.
 *
 * NOTE: this is a convenience/privacy UX feature, not server-grade auth. The
 * hash is computed with the Web Crypto API (SHA-256 over a fixed app salt + the
 * password) and stored locally. It keeps casual onlookers out of the Recently
 * Deleted view on a shared device; it is NOT a substitute for real authz.
 */

const APP_SALT = 'apg::recently-deleted::v1';

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns `sha256:<hex>` for the given password, or '' if Web Crypto is absent. */
export async function hashPassword(password: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const data = new TextEncoder().encode(`${APP_SALT}:${password}`);
  const digest = await subtle.digest('SHA-256', data);
  return `sha256:${toHex(digest)}`;
}

/** Constant-time-ish comparison of a candidate password against a stored hash. */
export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  const candidate = await hashPassword(password);
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}

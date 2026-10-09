// S3 website endpoints use HTTP, where crypto.randomUUID may be unavailable.
// getRandomValues also works there and preserves strong request-key entropy.
export function requestKey() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

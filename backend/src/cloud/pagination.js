import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail } from '../lib/validation.js';
const signature = (text) =>
  createHmac('sha256', process.env.JWT_SECRET).update(text).digest('base64url');
export function pagination(query, userId, scope) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    fail('Page size must be between 1 and 100.');
  let cursor;
  if (query.cursor) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 4096) throw Error();
      const [body, sig, extra] = query.cursor.split('.');
      const expected = Buffer.from(signature(body)),
        actual = Buffer.from(sig || '');
      if (
        extra ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw Error();
      const value = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (value.userId !== userId || value.scope !== scope) throw Error();
      cursor = value.key;
    } catch {
      fail('Invalid pagination cursor. Refresh the list.');
    }
  }
  return {
    limit,
    cursor,
    encode(key) {
      if (!key) return null;
      const body = Buffer.from(JSON.stringify({ userId, scope, key })).toString(
        'base64url',
      );
      return `${body}.${signature(body)}`;
    },
  };
}

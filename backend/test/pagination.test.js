import test from 'node:test';
import assert from 'node:assert/strict';
import { pagination } from '../src/cloud/pagination.js';
import { createCommerceStore } from '../src/cloud/commerce-store.js';
test('pagination cursors are signed and bound to user and list', () => {
  process.env.JWT_SECRET = 'pagination-test-secret-at-least-32-chars';
  const p = pagination({ limit: '10' }, 'buyer', 'offers:made');
  const key = { PK: 'OFFER#a', SK: 'DETAILS', buyerPK: 'USER#buyer', buyerSK: '2026#a' };
  const token = p.encode(key);
  assert.deepEqual(pagination({ cursor: token }, 'buyer', 'offers:made').cursor, key);
  for (const [user, scope, cursor] of [
    ['other', 'offers:made', token],
    ['buyer', 'offers:received', token],
    ['buyer', 'offers:made', token + 'x'],
  ])
    assert.throws(
      () => pagination({ cursor }, user, scope),
      (e) => e.status === 400,
    );
  assert.throws(
    () => pagination({ limit: 101 }, 'buyer', 'wallet'),
    (e) => e.status === 400,
  );
  assert.equal(p.encode(null), null);
});
test('domain pages query correct indexes, limits and continuation keys without table scans', async () => {
  const seen = [];
  const client = {
    async send(c) {
      seen.push(c.input);
      return { Items: [], LastEvaluatedKey: { PK: 'x', SK: 'DETAILS' } };
    },
  };
  const store = createCommerceStore(client, 'users', 'listings');
  for (const [type, direction, index, table] of [
    ['OFFER', 'received', 'SellerIndex', 'relive-offers'],
    ['PURCHASE', 'purchases', 'BuyerIndex', 'relive-purchases'],
    ['WALLET', null, 'UserIndex', 'relive-wallet'],
    ['REVIEW', null, 'ReviewedUserIndex', 'relive-reviews'],
    ['NOTICE', null, undefined, 'relive-notifications'],
  ]) {
    const cursor = { PK: 'previous', SK: 'DETAILS' };
    const page = await store.page('u', type, { direction, limit: 7, cursor });
    const input = seen.at(-1);
    assert.equal(input.TableName, table);
    assert.equal(input.IndexName, index);
    assert.equal(input.Limit, 7);
    assert.deepEqual(input.ExclusiveStartKey, cursor);
    assert.equal(page.cursor.PK, 'x');
  }
});

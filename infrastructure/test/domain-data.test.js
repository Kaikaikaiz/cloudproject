import test from 'node:test';
import assert from 'node:assert/strict';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { transform, digest, copyTargets, verifyTargets } from '../lib/domain-data.js';
const user = { PK: 'USER#u', SK: 'PROFILE', id: 'u', walletBalance: 2000, version: 8 };
const offer = {
  PK: 'OFFER#o',
  SK: 'DETAILS',
  id: 'o',
  buyerId: 'u',
  sellerId: 's',
  listingId: 'l',
  createdAt: '2026-10-09',
  version: 1,
  history: [
    { id: 'z', amount: 100, createdAt: '2026-10-09' },
    { id: 'a', amount: 200, createdAt: '2026-10-09' },
  ],
};
test('domain transform preserves records, balances and chronological history without pointers', () => {
  const source = [
    user,
    offer,
    { PK: 'USER#u', SK: 'OFFER#o', recordId: 'o' },
    {
      PK: 'WALLET#w',
      SK: 'DETAILS',
      id: 'w',
      userId: 'u',
      type: 'SALE',
      status: 'SUCCESS',
      amount: 500,
      requestKey: 'keep-this-key',
      createdAt: '2026-10-09',
    },
  ];
  const before = digest(source),
    plan = transform(source);
  assert.equal(digest(source), before);
  const balance = plan.find((p) => p.item.SK === 'BALANCE');
  assert.equal(balance.TableName, 'relive-wallet');
  assert.equal(balance.item.walletBalance, 2000);
  assert.equal(balance.item.walletEarnings, 500);
  assert.equal(plan.find((p) => p.item.id === 'w').item.requestKey, 'keep-this-key');
  const metadata = plan.find((p) => p.item.id === 'o').item;
  assert.equal(metadata.history, undefined);
  assert.equal(metadata.buyerPK, 'USER#u');
  assert.deepEqual(
    plan
      .filter((p) => p.item.SK.startsWith('HISTORY'))
      .sort((a, b) => a.item.SK.localeCompare(b.item.SK))
      .map((p) => p.item.id),
    ['z', 'a'],
  );
  assert.equal(
    plan.some((p) => p.TableName === 'relive-users'),
    false,
  );
});
test('migration refuses unknown records and broken pointers', () => {
  assert.throws(() => transform([{ PK: 'UNKNOWN#1', SK: 'DETAILS' }]), /Unrecognised/);
  assert.throws(
    () => transform([{ PK: 'USER#u', SK: 'OFFER#missing', recordId: 'missing' }]),
    /Dangling/,
  );
  assert.throws(() => transform([{ ...user, walletBalance: -1 }]), /Invalid/);
});
test('copy is restartable, verifies contents and refuses to overwrite conflicting destinations', async () => {
  const rows = new Map();
  const key = (t, i) => `${t}/${i.PK.S}/${i.SK.S}`;
  const client = {
    async send(c) {
      const p = c.input;
      if (c.constructor.name === 'PutItemCommand') {
        const k = key(p.TableName, p.Item);
        if (rows.has(k)) {
          const e = Error();
          e.name = 'ConditionalCheckFailedException';
          throw e;
        }
        rows.set(k, p.Item);
        return {};
      }
      if (c.constructor.name === 'GetItemCommand')
        return { Item: rows.get(key(p.TableName, p.Key)) };
      if (c.constructor.name === 'ScanCommand')
        return {
          Items: [...rows]
            .filter(([k]) => k.startsWith(p.TableName + '/'))
            .map(([, v]) => v),
        };
      throw Error(c.constructor.name);
    },
  };
  const plan = transform([user, offer]);
  await copyTargets(client, plan);
  await copyTargets(client, plan);
  await verifyTargets(client, plan);
  const k = [...rows.keys()][0],
    item = unmarshall(rows.get(k));
  item.walletBalance = 99;
  rows.set(k, marshall(item));
  await assert.rejects(copyTargets(client, plan), /differs/);
  await assert.rejects(verifyTargets(client, plan), /verification failed/);
});

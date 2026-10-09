import { createHash } from 'node:crypto';
import { ScanCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  domainTables,
  tableFor,
  layout,
  historyItem,
} from '../../backend/src/cloud/table-layout.js';
export const tables = domainTables({});
export const markerKey = { PK: { S: 'DATA_MIGRATION' }, SK: { S: 'domain-v2' } };
const canonical = (x) =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : x;
export const digest = (x) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(x)))
    .digest('hex');
export async function scan(client, TableName) {
  const rows = [];
  let cursor;
  do {
    const page = await client.send(
      new ScanCommand({ TableName, ConsistentRead: true, ExclusiveStartKey: cursor }),
    );
    rows.push(...(page.Items || []).map(unmarshall));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return rows.sort((a, b) => `${a.PK}/${a.SK}`.localeCompare(`${b.PK}/${b.SK}`));
}
export function transform(rows) {
  const output = new Map();
  function add(TableName, item) {
    const k = JSON.stringify([TableName, item.PK, item.SK]);
    const prior = output.get(k);
    if (prior && digest(prior.item) !== digest(item))
      throw Error('Conflicting source records for ' + k);
    output.set(k, { TableName, item });
  }
  const source = new Map(rows.map((r) => [`${r.PK}/${r.SK}`, r]));
  for (const item of rows) {
    const type = item.PK.split('#')[0];
    if (type === 'USER' && item.SK === 'PROFILE') {
      if (!Number.isSafeInteger(item.walletBalance) || item.walletBalance < 0)
        throw Error('Invalid source wallet balance');
      add(
        tables.wallet,
        layout('BALANCE', {
          id: item.id,
          walletBalance: item.walletBalance,
          walletEarnings: rows
            .filter(
              (r) =>
                r.PK.startsWith('WALLET#') &&
                r.userId === item.id &&
                r.type === 'SALE' &&
                r.status === 'SUCCESS',
            )
            .reduce((sum, r) => sum + r.amount, 0),
          version: 0,
        }),
      );
      continue;
    }
    if (type === 'EMAIL' && item.SK === 'UNIQUE') continue;
    if (type === 'USER' && item.SK.startsWith('FAV#')) {
      add(tables.favourites, item);
      continue;
    }
    if (type === 'USER' && item.recordId) {
      const recordType = item.SK.split('#')[0];
      const target = source.get(`${recordType}#${item.recordId}/DETAILS`);
      if (!target) throw Error('Dangling source pointer ' + item.SK);
      if (
        ![target.userId, target.buyerId, target.sellerId, target.reviewedUserId].includes(
          item.PK.slice(5),
        )
      )
        throw Error('Invalid source participant pointer');
      continue;
    }
    if (
      ['OFFER', 'NEGOTIATION', 'WALLET', 'PURCHASE', 'NOTICE', 'REVIEW'].includes(type) &&
      item.SK === 'DETAILS'
    ) {
      add(tableFor(type, tables), layout(type, item));
      if (type === 'OFFER')
        for (const [position, h] of (item.history || []).entries())
          add(tables.offers, historyItem(item.id, h, position));
      continue;
    }
    throw Error(`Unrecognised source record ${item.PK}/${item.SK}; migration stopped.`);
  }
  return [...output.values()];
}
export async function readMarker(client) {
  return (
    await client.send(
      new GetItemCommand({
        TableName: 'relive-migrations',
        Key: markerKey,
        ConsistentRead: true,
      }),
    )
  ).Item;
}
export async function verifyTargets(client, plan) {
  for (const { TableName, item } of plan) {
    const result = await client.send(
      new GetItemCommand({
        TableName,
        Key: marshall({ PK: item.PK, SK: item.SK }),
        ConsistentRead: true,
      }),
    );
    if (!result.Item || digest(unmarshall(result.Item)) !== digest(item))
      throw Error(`Target verification failed: ${TableName}/${item.PK}/${item.SK}`);
  }
  // Reject unexpected records as well; destination tables must be dedicated to this cutover.
  for (const TableName of new Set(
    Object.values(tables).filter((t) => !['relive-users', 'relive-listings'].includes(t)),
  )) {
    const actual = await scan(client, TableName),
      expected = plan.filter((p) => p.TableName === TableName).map((p) => p.item);
    if (actual.length !== expected.length)
      throw Error(`Unexpected record count in ${TableName}`);
  }
}
export async function copyTargets(client, plan) {
  for (const { TableName, item } of plan) {
    try {
      await client.send(
        new PutItemCommand({
          TableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
      const saved = await client.send(
        new GetItemCommand({
          TableName,
          Key: marshall({ PK: item.PK, SK: item.SK }),
          ConsistentRead: true,
        }),
      );
      if (!saved.Item || digest(unmarshall(saved.Item)) !== digest(item))
        throw Error(
          `Existing destination differs: ${TableName}/${item.PK}/${item.SK}. Nothing overwritten.`,
        );
    }
  }
}
export async function verifyReady(client) {
  const marker = await readMarker(client);
  if (marker?.phase?.S !== 'READY')
    throw Error('Verified domain data migration is required before cutover.');
  const source = await scan(client, tables.users);
  if (digest(source) !== marker.sourceDigest.S)
    throw Error(
      'Source data changed after migration. Stop and reconcile before deployment.',
    );
  if (digest(await scan(client, tables.listings)) !== marker.listingsDigest?.S)
    throw Error('Listings changed after migration.');
  await verifyTargets(client, transform(source));
  return marker;
}

import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  domainTables,
  tableFor,
  layout,
  profileItem,
  historyItem,
} from './table-layout.js';

export function createCommerceStore(client, usersTable, listingsTable, options = {}) {
  const tables = {
    ...domainTables(),
    ...options,
    users: usersTable,
    listings: listingsTable,
  };
  async function query(input) {
    const items = [];
    let cursor;
    do {
      const page = await client.send(
        new QueryCommand({ ...input, ExclusiveStartKey: cursor }),
      );
      items.push(...(page.Items || []));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return items;
  }
  async function withHistory(item) {
    if (!item) return item;
    return {
      ...item,
      history: await query({
        TableName: tables.offers,
        ConsistentRead: true,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `OFFER#${item.id}`, ':prefix': 'HISTORY#' },
      }),
    };
  }
  const queryInput = (userId, type, direction) => {
    const TableName = tableFor(type, tables);
    if (type === 'NOTICE')
      return {
        TableName,
        ConsistentRead: true,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'NOTICE#' },
        ScanIndexForward: false,
      };
    const prefix =
      type === 'WALLET'
        ? 'user'
        : type === 'REVIEW'
          ? 'reviewed'
          : direction === 'received' || direction === 'sales'
            ? 'seller'
            : 'buyer';
    const IndexName = {
      buyer: 'BuyerIndex',
      seller: 'SellerIndex',
      user: 'UserIndex',
      reviewed: 'ReviewedUserIndex',
    }[prefix];
    return {
      TableName,
      IndexName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': `${prefix}PK` },
      ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      ScanIndexForward: false,
    };
  };
  return {
    async record(type, id) {
      const item = (
        await client.send(
          new GetCommand({
            TableName: tableFor(type, tables),
            Key:
              type === 'BALANCE'
                ? { PK: `USER#${id}`, SK: 'BALANCE' }
                : { PK: `${type}#${id}`, SK: 'DETAILS' },
            ConsistentRead: true,
          }),
        )
      ).Item;
      return type === 'OFFER' ? withHistory(item) : item;
    },
    async page(userId, type, { direction, limit = 20, cursor } = {}) {
      const input = queryInput(userId, type, direction);
      const page = await client.send(
        new QueryCommand({ ...input, Limit: limit, ExclusiveStartKey: cursor }),
      );
      const items =
        type === 'OFFER'
          ? await Promise.all((page.Items || []).map(withHistory))
          : page.Items || [];
      return { items, cursor: page.LastEvaluatedKey || null };
    },
    async records(userId, type, direction) {
      if ((type === 'OFFER' || type === 'PURCHASE') && !direction) {
        const results = await Promise.all([
          this.records(userId, type, 'made'),
          this.records(userId, type, 'received'),
        ]);
        return [...new Map(results.flat().map((item) => [item.id, item])).values()].sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt),
        );
      }
      const items = await query(queryInput(userId, type, direction));
      return type === 'OFFER' ? Promise.all(items.map(withHistory)) : items;
    },
    async commit(changes) {
      const TransactItems = [];
      function put(type, item, old) {
        TransactItems.push({
          Put: {
            TableName: tableFor(type, tables),
            Item: layout(type, item),
            ConditionExpression: old ? '#v = :v' : 'attribute_not_exists(PK)',
            ...(old
              ? {
                  ExpressionAttributeNames: { '#v': 'version' },
                  ExpressionAttributeValues: { ':v': old.version },
                }
              : {}),
          },
        });
      }
      for (const { type, item, old } of changes) {
        if (type === 'USER') {
          if (!old) throw new Error('Create accounts through store.register.');
          if (
            item.walletBalance !== old.walletBalance ||
            item.walletEarnings !== old.walletEarnings
          ) {
            if (!Number.isSafeInteger(old.balanceVersion))
              throw new Error('Wallet migration is required.');
            put(
              'BALANCE',
              {
                id: item.id,
                walletBalance: item.walletBalance,
                walletEarnings: item.walletEarnings || 0,
                version: old.balanceVersion + 1,
                updatedAt: item.updatedAt,
              },
              { version: old.balanceVersion },
            );
          }
          const comparable = (value) => {
            const { version, updatedAt, ...rest } = profileItem(value);
            return rest;
          };
          if (JSON.stringify(comparable(item)) !== JSON.stringify(comparable(old)))
            put('USER', item, old);
        } else {
          put(type, item, old);
          if (type === 'OFFER') {
            const existing = new Set((old?.history || []).map((h) => h.id));
            for (const [position, h] of (item.history || []).entries())
              if (!existing.has(h.id))
                TransactItems.push({
                  Put: {
                    TableName: tables.offers,
                    Item: historyItem(item.id, h, position),
                    ConditionExpression: 'attribute_not_exists(PK)',
                  },
                });
          }
        }
      }
      if (TransactItems.length > 100)
        throw new Error('Transaction exceeds DynamoDB action limit.');
      if (TransactItems.length)
        await client.send(new TransactWriteCommand({ TransactItems }));
    },
  };
}

import { createModerationStore } from './moderation.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createCommerceStore } from './commerce-store.js';
import { domainTables, profileItem } from './table-layout.js';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

export function createStore({
  client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  usersTable = process.env.USERS_TABLE || 'relive-users',
  listingsTable = process.env.LISTINGS_TABLE || 'relive-listings',
  tables = domainTables(),
} = {}) {
  const userKey = (id) => ({ PK: `USER#${id}`, SK: 'PROFILE' });
  const emailKey = (email) => ({ PK: `EMAIL#${email}`, SK: 'UNIQUE' });
  const listingKey = (id) => ({ PK: `LISTING#${id}`, SK: 'DETAILS' });
  const get = async (TableName, Key) =>
    (await client.send(new GetCommand({ TableName, Key, ConsistentRead: true }))).Item;
  async function queryAll(input) {
    const items = [];
    let cursor;
    do {
      const page = await client.send(
        new QueryCommand({ ...input, ExclusiveStartKey: cursor }),
      );
      items.push(...(page.Items || []));
      cursor = page.LastEvaluatedKey;
      if (items.length > 5000) {
        const error = new Error(
          'This coursework catalogue exceeds its query limit. Cursor-based frontend pagination is required.',
        );
        error.status = 503;
        throw error;
      }
    } while (cursor);
    return items;
  }
  const commerce = createCommerceStore(client, usersTable, listingsTable, tables);
  const loadUser = async (id) => {
    const user = await get(usersTable, userKey(id));
    if (!user) return user;
    const balance = await commerce.record('BALANCE', id);
    if (!balance) throw new Error('Wallet migration is required for this account.');
    return {
      ...user,
      walletBalance: balance.walletBalance,
      walletEarnings: balance.walletEarnings || 0,
      balanceVersion: balance.version,
    };
  };
  return {
    commerce,
    moderation: createModerationStore(client, {listings: listingsTable, notifications: tables.notifications}),
    user: loadUser,
    async userByEmail(email) {
      const lock = await get(usersTable, emailKey(email));
      return lock ? loadUser(lock.userId) : undefined;
    },
    async register(user) {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: usersTable,
                Item: { ...profileItem(user), ...userKey(user.id) },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: tables.wallet,
                Item: {
                  PK: `USER#${user.id}`,
                  SK: 'BALANCE',
                  id: user.id,
                  walletBalance: user.walletBalance || 0,
                  walletEarnings: 0,
                  version: 0,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: usersTable,
                Item: { ...emailKey(user.email), userId: user.id },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    },
    async saveUser(old, next) {
      const writes = [
        {
          Put: {
            TableName: usersTable,
            Item: { ...profileItem(next), ...userKey(next.id) },
            ConditionExpression: '#version = :version',
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: { ':version': old.version },
          },
        },
      ];
      if (old.email !== next.email)
        writes.push(
          {
            Delete: {
              TableName: usersTable,
              Key: emailKey(old.email),
              ConditionExpression: 'userId = :id',
              ExpressionAttributeValues: { ':id': old.id },
            },
          },
          {
            Put: {
              TableName: usersTable,
              Item: { ...emailKey(next.email), userId: next.id },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        );
      await client.send(new TransactWriteCommand({ TransactItems: writes }));
    },
    async logout(id) {
      await client.send(
        new UpdateCommand({
          TableName: usersTable,
          Key: userKey(id),
          UpdateExpression: 'ADD tokenVersion :one, #version :one',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':one': 1 },
        }),
      );
    },
    listing: (id) => get(listingsTable, listingKey(id)),
    async saveListing(item, old) {
      await client.send(
        new PutCommand({
          TableName: listingsTable,
          Item: { ...item, ...listingKey(item.id) },
          ConditionExpression: old
            ? '#version = :version AND sellerId = :seller'
            : 'attribute_not_exists(PK)',
          ...(old
            ? {
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: {
                  ':version': old.version,
                  ':seller': old.sellerId,
                },
              }
            : {}),
        }),
      );
    },
    listings: (sellerId) =>
      queryAll({
        TableName: listingsTable,
        IndexName: sellerId ? 'SellerIndex' : 'StatusIndex',
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': sellerId ? 'sellerPK' : 'statusPK' },
        ExpressionAttributeValues: {
          ':pk': sellerId ? `USER#${sellerId}` : 'STATUS#ACTIVE',
        },
        ScanIndexForward: false,
      }),
    favourites: (id) =>
      queryAll({
        TableName: tables.favourites,
        ConsistentRead: true,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `USER#${id}`, ':prefix': 'FAV#' },
      }),
    favourite: (id, listingId) =>
      get(tables.favourites, { PK: `USER#${id}`, SK: `FAV#${listingId}` }),
    async setFavourite(id, listingId, enabled) {
      const Key = { PK: `USER#${id}`, SK: `FAV#${listingId}` };
      if (!enabled)
        return client.send(new DeleteCommand({ TableName: tables.favourites, Key }));
      return client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: listingsTable,
                Key: listingKey(listingId),
                ConditionExpression: '#status = :active AND sellerId <> :id',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':active': 'ACTIVE', ':id': id },
              },
            },
            {
              Put: {
                TableName: tables.favourites,
                Item: { ...Key, listingId, createdAt: new Date().toISOString() },
              },
            },
          ],
        }),
      );
    },
  };
}

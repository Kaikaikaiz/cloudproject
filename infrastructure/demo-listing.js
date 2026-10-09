import {
  DynamoDBClient, PutItemCommand, GetItemCommand,
  QueryCommand, UpdateItemCommand, DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { region, tableName, verifyAccount, reportError } from './config.js';

const action = process.argv[2];
const client = new DynamoDBClient({ region });
const Key = { PK: { S: 'LISTING#coursework-demo-001' }, SK: { S: 'DETAILS' } };
const marker = 'relive-coursework-crud-demo';
const decode = item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value.S ?? (value.N === undefined ? value : Number(value.N))]));
const print = item => console.log(JSON.stringify(decode(item), null, 2));

async function read() {
  const result = await client.send(new GetItemCommand({ TableName: tableName, Key, ConsistentRead: true }));
  if (result.Item) print(result.Item);
  else console.log('Demo listing does not exist.');
}

try {
  if (!['create', 'read', 'query', 'update', 'delete'].includes(action)) {
    throw new Error('Usage: node demo-listing.js create|read|query|update|delete');
  }
  await verifyAccount();
  if (action === 'create') {
    const now = new Date().toISOString();
    await client.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        ...Key,
        demoMarker: { S: marker },
        sellerId: { S: 'coursework-demo-user' },
        title: { S: 'Coursework demo textbook' },
        description: { S: 'Disposable record for DynamoDB CRUD evidence.' },
        price: { N: '2500' },
        status: { S: 'ACTIVE' },
        createdAt: { S: now },
        updatedAt: { S: now },
        sellerPK: { S: 'USER#coursework-demo-user' },
        sellerSK: { S: `${now}#coursework-demo-001` },
        statusPK: { S: 'STATUS#ACTIVE' },
        statusSK: { S: `${now}#coursework-demo-001` },
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    console.log('Created demo listing. Price 2500 sen = RM25.00.');
    await read();
  } else if (action === 'read') {
    await read();
  } else if (action === 'query') {
    // Query the base-table partition and both GSIs, following all result pages.
    const queries = [
      { label: 'Primary key query', partition: 'PK', value: Key.PK.S, consistent: true },
      { label: 'SellerIndex query', index: 'SellerIndex', partition: 'sellerPK', value: 'USER#coursework-demo-user' },
      { label: 'StatusIndex query', index: 'StatusIndex', partition: 'statusPK', value: 'STATUS#ACTIVE' },
    ];
    for (const query of queries) {
      console.log(`\n${query.label}:`);
      let cursor;
      let count = 0;
      do {
        const result = await client.send(new QueryCommand({
          TableName: tableName,
          IndexName: query.index,
          KeyConditionExpression: '#pk = :pk',
          ExpressionAttributeNames: { '#pk': query.partition },
          ExpressionAttributeValues: { ':pk': { S: query.value } },
          ConsistentRead: query.consistent ?? false,
          ExclusiveStartKey: cursor,
        }));
        for (const item of result.Items ?? []) { print(item); count++; }
        cursor = result.LastEvaluatedKey;
      } while (cursor);
      console.log(`${count} item(s).`);
    }
    console.log('GSIs are eventually consistent. If a recent change is missing, rerun this command shortly.');
  } else if (action === 'update') {
    const result = await client.send(new UpdateItemCommand({
      TableName: tableName, Key,
      UpdateExpression: 'SET price = :price, updatedAt = :now',
      ConditionExpression: 'demoMarker = :marker AND sellerId = :seller',
      ExpressionAttributeValues: {
        ':price': { N: '2000' }, ':now': { S: new Date().toISOString() },
        ':marker': { S: marker }, ':seller': { S: 'coursework-demo-user' },
      },
      ReturnValues: 'ALL_NEW',
    }));
    console.log('Updated demo price to 2000 sen = RM20.00.');
    print(result.Attributes);
  } else {
    await client.send(new DeleteItemCommand({
      TableName: tableName, Key,
      ConditionExpression: 'demoMarker = :marker AND sellerId = :seller',
      ExpressionAttributeValues: { ':marker': { S: marker }, ':seller': { S: 'coursework-demo-user' } },
    }));
    console.log('Deleted only the marked coursework demo listing.');
    await read();
  }
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    console.error(action === 'create'
      ? 'The demo key already exists; nothing was overwritten. Run npm run demo:read to inspect it.'
      : 'The demo record is missing or its ownership marker does not match; nothing was changed.');
    process.exitCode = 1;
  } else reportError(error);
}

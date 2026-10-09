import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { verifyAccount, region, reportError } from './config.js';
try {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@'))
    throw Error('Usage: node set-admin.js EMAIL [--apply]');
  await verifyAccount();
  const client = new DynamoDBClient({ region });
  const lock = await client.send(
    new GetItemCommand({
      TableName: 'relive-users',
      Key: { PK: { S: `EMAIL#${email}` }, SK: { S: 'UNIQUE' } },
      ConsistentRead: true,
    }),
  );
  const id = lock.Item?.userId?.S;
  if (!id) throw Error('Register this account first. No account was changed.');
  const Key = { PK: { S: `USER#${id}` }, SK: { S: 'PROFILE' } };
  const result = await client.send(
    new GetItemCommand({ TableName: 'relive-users', Key, ConsistentRead: true }),
  );
  const user = result.Item;
  if (user?.email?.S !== email) throw Error('Account identity mismatch.');
  console.log(
    JSON.stringify(
      {
        userId: id,
        currentRole: user.role.S,
        proposedRole: 'ADMIN',
        apply: process.argv.includes('--apply'),
      },
      null,
      2,
    ),
  );
  if (process.argv.includes('--apply')) {
    if (user.role.S === 'ADMIN') {
      console.log('Already an administrator.');
    } else {
      await client.send(
        new UpdateItemCommand({
          TableName: 'relive-users',
          Key,
          UpdateExpression: 'SET #role = :admin ADD #version :one, tokenVersion :one',
          ConditionExpression:
            '#version = :version AND email = :email AND #role = :member',
          ExpressionAttributeNames: { '#role': 'role', '#version': 'version' },
          ExpressionAttributeValues: {
            ':admin': { S: 'ADMIN' },
            ':member': { S: 'USER' },
            ':version': user.version,
            ':email': { S: email },
            ':one': { N: '1' },
          },
        }),
      );
      console.log(
        'Administrator role assigned. Log in again; old sessions were revoked.',
      );
    }
  }
} catch (error) {
  reportError(error);
}

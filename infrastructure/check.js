import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { region, expectedAccount, tableName, buckets, verifyAccount, reportError } from './config.js';

try {
  await verifyAccount();
  const s3 = new S3Client({ region });
  for (const Bucket of buckets) {
    await s3.send(new HeadBucketCommand({ Bucket, ExpectedBucketOwner: expectedAccount }));
    console.log(`S3 bucket accessible: ${Bucket}`);
  }
  try {
    const { Table } = await new DynamoDBClient({ region }).send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`DynamoDB table: ${Table.TableName} (${Table.TableStatus})`);
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') throw error;
    console.log(`DynamoDB table ${tableName} does not exist yet. Run npm run setup:database to create it.`);
  }
} catch (error) {
  reportError(error);
}

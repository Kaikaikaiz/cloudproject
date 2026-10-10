import { services } from './services.js';
import { tables, readMarker, verifyReady } from './lib/domain-data.js';
import { assertFrozen } from './lib/domain-maintenance.js';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { LambdaClient, GetFunctionConfigurationCommand, CreateFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, CreateEventSourceMappingCommand, ListEventSourceMappingsCommand, PutFunctionConcurrencyCommand, waitUntilFunctionActiveV2, waitUntilFunctionUpdatedV2 } from '@aws-sdk/client-lambda';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { IAMClient, GetRoleCommand } from '@aws-sdk/client-iam';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { region, expectedAccount, verifyAccount, reportError } from './config.js';
export const origin = process.env.FRONTEND_ORIGIN || 'http://relive-web-cloudproject.s3-website-us-east-1.amazonaws.com';
try {
  if (!process.argv.includes('--apply')) throw new Error('Deployment requires explicit --apply. No AWS changes made.');
  await verifyAccount();
  const database = new DynamoDBClient({ region });
  const marker = await readMarker(database);
  const cutover = marker?.phase?.S !== 'CUTOVER';
  if (cutover) {
    if (!process.argv.includes('--domain-cutover')) throw new Error('First domain deployment requires --domain-cutover, maintenance, and verified data migration.');
    await assertFrozen();
    await verifyReady(database);
  }
  const client = new LambdaClient({ region });
  async function config(name) {
    try { return await client.send(new GetFunctionConfigurationCommand({ FunctionName: name })); }
    catch (error) { if (error.name !== 'ResourceNotFoundException') throw error; }
  }
  const legacy = await config('relive-api');
  const auth = await config('relive-auth');
  const seed = auth?.Environment?.Variables || legacy?.Environment?.Variables || {};
  const secret = seed.JWT_SECRET || randomBytes(48).toString('hex');
  // Preflight all packages before changing any Lambda.
  const packages = await Promise.all(services.map(service => readFile(new URL(`./dist/relive-${service}.zip`, import.meta.url))));
  for (const [index, service] of services.entries()) {
  const FunctionName = `relive-${service}`;
  let previous;
  try { previous = await client.send(new GetFunctionConfigurationCommand({ FunctionName })); }
  catch (error) { if (error.name !== 'ResourceNotFoundException') throw error; }
  const Role = process.env.LAMBDA_ROLE_ARN || previous?.Role || legacy?.Role || (await new IAMClient({ region }).send(new GetRoleCommand({ RoleName: 'LabRole' }))).Role.Arn;
  if (!Role.startsWith(`arn:aws:iam::${expectedAccount}:role/`)) throw new Error('Execution role belongs to another account.');
  const Environment = { Variables: { ...seed, ...previous?.Environment?.Variables,
    USERS_TABLE: 'relive-users', LISTINGS_TABLE: 'relive-listings', IMAGES_BUCKET: 'relive-images-cloudproject',
    ...Object.fromEntries(Object.entries(tables).map(([name, value]) => [`${name.toUpperCase()}_TABLE`, value])),
    STORAGE_SCHEMA: 'domain-v2', REPORTS_TABLE: 'relive-reports',
    NODE_ENV: 'production', ALLOWED_ORIGINS: origin,
    JWT_SECRET: secret,
  } };
  const ZipFile = packages[index];
  if (previous) {
    await client.send(new UpdateFunctionCodeCommand({ FunctionName, ZipFile }));
    await waitUntilFunctionUpdatedV2({ client, maxWaitTime: 300 }, { FunctionName });
    await client.send(new UpdateFunctionConfigurationCommand({ FunctionName, Role, Runtime: 'nodejs22.x', Handler: 'index.handler', Environment, MemorySize: 512, Timeout: 20 }));
    await waitUntilFunctionUpdatedV2({ client, maxWaitTime: 300 }, { FunctionName });
  } else {
    await client.send(new CreateFunctionCommand({ FunctionName, Role, Runtime: 'nodejs22.x', Handler: 'index.handler', Code: { ZipFile }, Environment, MemorySize: 512, Timeout: 20 }));
    await waitUntilFunctionActiveV2({ client, maxWaitTime: 300 }, { FunctionName });
    if (cutover) await client.send(new PutFunctionConcurrencyCommand({ FunctionName, ReservedConcurrentExecutions: 0 }));
  }
  console.log(`Deployed ${FunctionName}`);
  }
  // Attach the listings table stream to the listings service. The handler
  // distinguishes DynamoDB stream events from API Gateway events.
  const dynamodb = new DynamoDBClient({ region });
  const table = await dynamodb.send(new DescribeTableCommand({ TableName: 'relive-listings' }));
  if (!table.Table.LatestStreamArn) throw new Error('relive-listings has no enabled stream. Run db:migrate first.');
  const streamLabel = table.Table.LatestStreamArn;
  const mappings = await client.send(new ListEventSourceMappingsCommand({ EventSourceArn: streamLabel, FunctionName: 'relive-listings' }));
  if (!mappings.EventSourceMappings?.some(item => item.State !== 'Deleting')) {
    await client.send(new CreateEventSourceMappingCommand({ 
      EventSourceArn: streamLabel, 
      FunctionName: 'relive-listings', 
      StartingPosition: 'LATEST', 
      BatchSize: 10, 
      BisectBatchOnFunctionError: true, 
      FunctionResponseTypes: ['ReportBatchItemFailures'], 
      Enabled: true 
    }));
    console.log('Created DynamoDB Streams mapping for relive-listings.');
  } else console.log('DynamoDB Streams mapping for relive-listings already exists.');
  await new S3Client({ region }).send(new PutBucketCorsCommand({ Bucket: 'relive-images-cloudproject', ExpectedBucketOwner: expectedAccount,
    CORSConfiguration: { CORSRules: [{ AllowedOrigins: [origin], AllowedMethods: ['POST'], AllowedHeaders: ['*'], MaxAgeSeconds: 300 }] },
  }));
  console.log('Lambda deployed; images bucket CORS configured. No public bucket policy was added. Next run node deploy-api.js --apply.');
} catch (error) { reportError(error); }

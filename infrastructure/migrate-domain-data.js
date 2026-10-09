import {
  DynamoDBClient,
  CreateBackupCommand,
  DescribeBackupCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { verifyAccount, region, reportError } from './config.js';
import { assertFrozen } from './lib/domain-maintenance.js';
import {
  scan,
  transform,
  digest,
  copyTargets,
  verifyTargets,
  readMarker,
  markerKey,
  tables,
} from './lib/domain-data.js';
const client = new DynamoDBClient({ region });
try {
  await verifyAccount();
  const apply = process.argv.includes('--apply'),
    verify = process.argv.includes('--verify');
  const marker = await readMarker(client);
  if (marker?.phase?.S === 'CUTOVER')
    throw Error('Cutover already completed. Legacy source must not be copied again.');
  if (apply || verify) await assertFrozen();
  const rows = await scan(client, tables.users),
    listings = await scan(client, tables.listings),
    plan = transform(rows);
  const userIds = new Set(rows.filter((r) => r.SK === 'PROFILE').map((r) => r.id)),
    listingIds = new Set(listings.map((l) => l.id));
  for (const { item } of plan) {
    for (const field of ['userId', 'buyerId', 'sellerId', 'reviewerId', 'reviewedUserId'])
      if (item[field] && !userIds.has(item[field]))
        throw Error(`Missing referenced account: ${field}`);
    if (item.listingId && !listingIds.has(item.listingId))
      throw Error('Missing referenced listing');
  }
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'copy' : verify ? 'verify' : 'read-only plan',
        sourceItems: rows.length,
        sourceDigest: digest(rows),
        destinations: Object.fromEntries(
          [...new Set(plan.map((p) => p.TableName))].map((t) => [
            t,
            plan.filter((p) => p.TableName === t).length,
          ]),
        ),
      },
      null,
      2,
    ),
  );
  if (apply) {
    const backups = [];
    for (const TableName of [tables.users, tables.listings]) {
      const response = await client.send(
        new CreateBackupCommand({
          TableName,
          BackupName: `domain-v2-${Date.now()}-${TableName}`,
        }),
      );
      const BackupArn = response.BackupDetails.BackupArn;
      let ready = false;
      for (let n = 0; n < 120; n++) {
        const state = await client.send(new DescribeBackupCommand({ BackupArn }));
        if (state.BackupDescription.BackupDetails.BackupStatus === 'AVAILABLE') {
          ready = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!ready) throw Error('Backup readiness timed out; no data copied.');
      backups.push(BackupArn);
      console.log(`Backup available: ${BackupArn}`);
    }
    await copyTargets(client, plan);
    await verifyTargets(client, plan);
    if (
      digest(await scan(client, tables.users)) !== digest(rows) ||
      digest(await scan(client, tables.listings)) !== digest(listings)
    )
      throw Error('Source changed during copying. Keep maintenance enabled.');
    await client.send(
      new PutItemCommand({
        TableName: 'relive-migrations',
        Item: {
          ...markerKey,
          phase: { S: 'READY' },
          sourceDigest: { S: digest(rows) },
          listingsDigest: { S: digest(listings) },
          backups: { SS: backups },
          verifiedAt: { S: new Date().toISOString() },
        },
        ConditionExpression: 'attribute_not_exists(#phase) OR #phase = :ready',
        ExpressionAttributeNames: { '#phase': 'phase' },
        ExpressionAttributeValues: { ':ready': { S: 'READY' } },
      }),
    );
    console.log(
      'Copy verified. Original records retained. Keep maintenance enabled until deployment completes.',
    );
  } else if (verify) {
    await verifyTargets(client, plan);
    console.log('Every destination record and table count verified.');
  }
} catch (error) {
  reportError(error);
}

// Remove only migrated legacy business items; retain profiles and email locks.
import { DynamoDBClient, GetItemCommand, DeleteItemCommand, CreateBackupCommand, DescribeBackupCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { scan, readMarker, tables, digest } from './lib/domain-data.js';
import { layout, tableFor, historyItem } from '../backend/src/cloud/table-layout.js';
import { services } from './services.js';
import { verifyAccount, region, reportError } from './config.js';
const db = new DynamoDBClient({ region });
const get = async (table, item) => {
  const result = await db.send(new GetItemCommand({ TableName: table, Key: marshall({ PK: item.PK, SK: item.SK }), ConsistentRead: true }));
  return result.Item && unmarshall(result.Item);
};
try {
  await verifyAccount();
  const marker = await readMarker(db);
  if (marker?.phase?.S !== 'CUTOVER') throw Error('Domain cutover must be completed first.');
  const lambda = new LambdaClient({ region });
  const functions = [];
  let Marker;
  do {
    const page = await lambda.send(new ListFunctionsCommand({ Marker }));
    functions.push(...page.Functions);
    Marker = page.NextMarker;
  } while (Marker);
  for (const service of services) {
    const env = functions.find(f => f.FunctionName === `relive-${service}`)?.Environment?.Variables;
    if (env?.STORAGE_SCHEMA !== 'domain-v2' || Object.entries(tables).some(([name, table]) => env[`${name.toUpperCase()}_TABLE`] !== table)) throw Error('Unexpected deployed table configuration; no deletion.');
  }
  const rows = await scan(db, tables.users);
  const source = new Map(rows.map(r => [`${r.PK}/${r.SK}`, r]));
  const candidates = [], retained = [], reasons = {};
  async function migrated(row) {
    const type = row.PK.split('#')[0];
    const expected = type === 'USER' && row.SK.startsWith('FAV#') ? row : layout(type, row);
    const table = type === 'USER' ? tables.favourites : tableFor(type, tables);
    const target = await get(table, expected);
    if (!target) return false;
    if (digest(target) !== digest(expected)) {
      // A live destination may have progressed after cutover; identity must still match.
      if (!Number.isInteger(row.version) || !(target.version > row.version)) return false;
      for (const key of ['id', 'userId', 'buyerId', 'sellerId', 'listingId', 'reviewerId', 'reviewedUserId', 'transactionId', 'createdAt']) {
        if (row[key] !== undefined && target[key] !== row[key]) return false;
      }
    }
    if (type === 'OFFER') {
      for (const [i, h] of (row.history || []).entries()) {
        const expectedHistory = historyItem(row.id, h, i);
        const saved = await get(table, expectedHistory);
        if (!saved || digest(saved) !== digest(expectedHistory)) return false;
      }
    }
    return true;
  }
  for (const row of rows) {
    if ((row.PK.startsWith('USER#') && row.SK === 'PROFILE') || (row.PK.startsWith('EMAIL#') && row.SK === 'UNIQUE')) { retained.push(row); continue; }
    let actual = row;
    if (row.PK.startsWith('USER#') && row.recordId) {
      actual = source.get(`${row.SK.split('#')[0]}#${row.recordId}/DETAILS`);
      if (!actual || ![actual.userId, actual.buyerId, actual.sellerId, actual.reviewedUserId].includes(row.PK.slice(5))) actual = null;
    }
    let safe = false;
    try { safe = actual && (!actual.updatedAt || actual.updatedAt <= marker.verifiedAt.S) && (!actual.createdAt || actual.createdAt <= marker.verifiedAt.S) && await migrated(actual); }
    catch { safe = false; }
    if (safe) candidates.push(row);
    else { retained.push(row); const kind = row.PK.split('#')[0] + '/' + row.SK.split('#')[0]; reasons[kind] = (reasons[kind] || 0) + 1; }
  }
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'plan', sourceCount: rows.length, verifiedLegacyItems: candidates.length, retainedCount: retained.length, unverifiedRetained: reasons }, null, 2));
  if (process.argv.includes('--apply') && candidates.length) {
    const result = await db.send(new CreateBackupCommand({ TableName: tables.users, BackupName: `before-legacy-cleanup-${Date.now()}` }));
    const BackupArn = result.BackupDetails.BackupArn;
    let available = false;
    for (let n = 0; n < 120; n++) {
      const backup = await db.send(new DescribeBackupCommand({ BackupArn }));
      if (backup.BackupDescription.BackupDetails.BackupStatus === 'AVAILABLE') { available = true; break; }
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!available) throw Error('Backup not ready; nothing deleted.');
    console.log(`Backup available: ${BackupArn}`);
    let removed = 0;
    for (const row of candidates) {
      const names = {}, values = {};
      const checks = Object.entries(row).map(([key, value], i) => { names[`#a${i}`] = key; values[`:v${i}`] = value; return `#a${i} = :v${i}`; });
      await db.send(new DeleteItemCommand({ TableName: tables.users, Key: marshall({ PK: row.PK, SK: row.SK }), ConditionExpression: checks.join(' AND '), ExpressionAttributeNames: names, ExpressionAttributeValues: marshall(values) }));
      removed++;
    }
    const after = await scan(db, tables.users);
    for (const row of retained) if (!after.some(r => r.PK === row.PK && r.SK === row.SK)) throw Error('Retained item missing after cleanup.');
    console.log(JSON.stringify({ deleted: removed, remaining: after.length, accounts: after.filter(r => r.SK === 'PROFILE').length, emailLocks: after.filter(r => r.SK === 'UNIQUE' && r.PK.startsWith('EMAIL#')).length }, null, 2));
  }
} catch (error) { reportError(error); }

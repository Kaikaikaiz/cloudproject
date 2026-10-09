import { DynamoDBClient, CreateBackupCommand, DescribeBackupCommand, RestoreTableFromBackupCommand, ListBackupsCommand } from '@aws-sdk/client-dynamodb';
import { region, expectedAccount, verifyAccount, reportError } from './config.js';

const table = process.env.TABLE_NAME || 'relive-listings';
const client = new DynamoDBClient({ region });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitBackup(BackupArn) {
  for (let i = 0; i < 60; i += 1) {
    const result = await client.send(new DescribeBackupCommand({ BackupArn }));
    const status = result.BackupDescription?.BackupDetails?.BackupStatus;
    if (status === 'AVAILABLE') return result.BackupDescription;
    if (status === 'FAILED') throw new Error(`Backup failed: ${BackupArn}`);
    await wait(5000);
  }
  throw new Error('Backup did not become available within five minutes.');
}
try {
  if (!process.argv.includes('--apply')) throw new Error('Backup creation/restore requires explicit --apply. No AWS changes made.');
  await verifyAccount();
  const action = process.argv[2] || 'create';
  if (action === 'create') {
    const name = `relive-${table}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const result = await client.send(new CreateBackupCommand({ TableName: table, BackupName: name }));
    const backup = await waitBackup(result.BackupDetails.BackupArn);
    console.log(JSON.stringify({ table, backupArn: backup.BackupDetails.BackupArn, status: backup.BackupDetails.BackupStatus }, null, 2));
  } else if (action === 'list') {
    const result = await client.send(new ListBackupsCommand({ TableName: table, Limit: 20 }));
    console.log(JSON.stringify(result.BackupSummaries || [], null, 2));
  } else if (action === 'restore') {
    const backupArn = process.env.BACKUP_ARN;
    const target = process.env.RESTORE_TABLE_NAME || `${table}-restore-${Date.now()}`;
    if (!backupArn) throw new Error('Set BACKUP_ARN to an AVAILABLE backup ARN before restoring.');
    const result = await client.send(new RestoreTableFromBackupCommand({ BackupArn: backupArn, TargetTableName: target }));
    console.log(JSON.stringify({ restoredTable: result.TableDescription?.TableName, status: result.TableDescription?.TableStatus }, null, 2));
  } else throw new Error('Usage: node backup.js create|list|restore [--apply]');
} catch (error) { reportError(error); }

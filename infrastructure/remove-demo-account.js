import { DynamoDBClient, CreateBackupCommand, DescribeBackupCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { scan, digest } from './lib/domain-data.js';
import { verifyAccount, region, reportError } from './config.js';
const uid='d05134dc-2a30-4651-8d14-44ad61a952aa';
const lid='1e81eefe-7588-4eb3-98a8-24e7f30b154f';
const email='qinchong877@gmail.com';
try {
 await verifyAccount();
 const db=new DynamoDBClient({region});
 const data={};
 for(const name of ['users','listings','wallet','offers','purchases','favourites','notifications','reviews','reports']) data[name]=await scan(db,'relive-'+name);
 const profile=data.users.find(r=>r.PK==='USER#'+uid&&r.SK==='PROFILE');
 const lock=data.users.find(r=>r.PK==='EMAIL#'+email&&r.SK==='UNIQUE');
 const balance=data.wallet.find(r=>r.PK==='USER#'+uid&&r.SK==='BALANCE');
 const listing=data.listings.find(r=>r.id===lid);
 if(profile?.email!==email||profile.role!=='USER'||lock?.userId!==uid||balance?.walletBalance!==0||listing?.sellerId!==uid||listing.status!=='ACTIVE'||listing.title!=='iPhone, MacBook, iPad, Apple Watch & AirPods') throw Error('Target state changed; nothing deleted.');
 if(data.listings.some(r=>r.sellerId===uid&&r.id!==lid)) throw Error('Additional owned listings found; nothing deleted.');
 for(const name of ['offers','purchases','favourites','notifications','reviews','reports','wallet']) {
  const related=data[name].filter(r=>[r.id,r.userId,r.buyerId,r.sellerId,r.reporterId,r.reviewedUserId,r.reviewerId].includes(uid)||r.PK==='USER#'+uid||r.listingId===lid||String(r.link||'').includes(lid));
  if(related.some(r=>name!=='wallet'||r.PK!==balance.PK||r.SK!==balance.SK)) throw Error('Related activity found; nothing deleted.');
 }
 const targets=[['users',profile],['users',lock],['wallet',balance],['listings',listing]];
 console.log(JSON.stringify({account:email,listing:listing.title,records:targets.length,apply:process.argv.includes('--apply')}));
 if(!process.argv.includes('--apply')) process.exit(0);
 for(const name of ['users','listings','wallet']) {
  const result=await db.send(new CreateBackupCommand({TableName:'relive-'+name,BackupName:`before-demo-removal-${Date.now()}`}));
  const BackupArn=result.BackupDetails.BackupArn;
  let ready=false;
  for(let n=0;n<120;n++) {
   const b=await db.send(new DescribeBackupCommand({BackupArn}));
   if(b.BackupDescription.BackupDetails.BackupStatus==='AVAILABLE'){ready=true;break;}
   await new Promise(r=>setTimeout(r,5000));
  }
  if(!ready) throw Error('Backup not ready; nothing deleted.');
  console.log('Backup available: '+BackupArn);
 }
 // Recheck cross-table activity after backups, then condition each deletion on captured values.
 for(const name of Object.keys(data)) {
  if(digest(await scan(db,'relive-'+name))!==digest(data[name])) throw Error('Database changed during backup; nothing deleted. Rerun when idle.');
 }
 await db.send(new TransactWriteItemsCommand({TransactItems:targets.map(([name,row])=>{
  const names={},values={};
  const checks=Object.entries(row).map(([key,value],i)=>{names['#a'+i]=key;values[':v'+i]=value;return '#a'+i+' = :v'+i;});
  return {Delete:{TableName:'relive-'+name,Key:marshall({PK:row.PK,SK:row.SK}),ConditionExpression:checks.join(' AND '),ExpressionAttributeNames:names,ExpressionAttributeValues:marshall(values)}};
 })}));
 for(const name of ['users','listings','wallet']) {
  const after=await scan(db,'relive-'+name);
  for(const [table,row] of targets.filter(([table])=>table===name)) if(after.some(r=>r.PK===row.PK&&r.SK===row.SK)) throw Error('Deletion verification failed.');
  const untouched=data[name].filter(r=>!targets.some(([table,t])=>table===name&&t.PK===r.PK&&t.SK===r.SK));
  for(const row of untouched) if(!after.some(r=>r.PK===row.PK&&r.SK===row.SK)) throw Error('Unrelated item missing.');
 }
 console.log('Verified: four requested records removed; unrelated records retained. S3 images were not deleted.');
} catch(error){reportError(error);}

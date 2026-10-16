import {DynamoDBClient,CreateBackupCommand,DescribeBackupCommand,TransactWriteItemsCommand} from '@aws-sdk/client-dynamodb';
import {marshall} from '@aws-sdk/util-dynamodb';
import {scan,digest} from './lib/domain-data.js';
import {verifyAccount,region,reportError} from './config.js';
const uid='f71f634a-4365-4a33-9a9e-374cb0148b07',email='noreply.apakhabar@gmail.com';
const names=['users','listings','offers','purchases','wallet','favourites','notifications','reviews','reports'];
const db=new DynamoDBClient({region});
function condition(row){const n={},v={};const clauses=Object.entries(row).map(([k,x],i)=>{n['#a'+i]=k;v[':v'+i]=x;return '#a'+i+' = :v'+i;});return {ConditionExpression:clauses.join(' AND '),ExpressionAttributeNames:n,ExpressionAttributeValues:marshall(v)};}
try{
 await verifyAccount();const data={};for(const name of names)data[name]=await scan(db,'relive-'+name);
 const profile=data.users.find(r=>r.PK==='USER#'+uid&&r.SK==='PROFILE');
 if(profile?.email!==email||profile.role!=='USER')throw Error('Expected account not found; nothing changed.');
 const lids=new Set(data.listings.filter(r=>r.sellerId===uid).map(r=>r.id));
 const offers=data.offers.filter(r=>r.SK==='DETAILS'&&r.PK.startsWith('OFFER#')&&(r.buyerId===uid||r.sellerId===uid||lids.has(r.listingId)));
 const oids=new Set(offers.map(r=>r.id));
 const related=r=>[r.userId,r.buyerId,r.sellerId,r.reporterId,r.reviewerId,r.reviewedUserId].includes(uid)||r.PK==='USER#'+uid||lids.has(r.listingId);
 if(data.purchases.some(related)||data.reviews.some(related)||data.reports.some(related))throw Error('Purchase/review/report history requires separate reconciliation.');
 const wallet=data.wallet.filter(r=>related(r)||r.id===uid);
 if(wallet.length!==1||wallet[0].SK!=='BALANCE'||wallet[0].walletBalance!==0)throw Error('Wallet is not empty.');
 const targets=[];const add=(name,rows)=>rows.forEach(row=>targets.push({name,row}));
 add('users',data.users.filter(r=>r.PK==='USER#'+uid||(r.PK==='EMAIL#'+email&&r.SK==='UNIQUE'&&r.userId===uid)));
 add('listings',data.listings.filter(r=>lids.has(r.id)));
 add('offers',data.offers.filter(r=>oids.has(r.PK.replace(/^OFFER#/,''))||oids.has(r.offerId)));
 add('wallet',wallet);add('favourites',data.favourites.filter(related));
 add('notifications',data.notifications.filter(r=>related(r)||[...lids,...oids].some(id=>r.link?.includes(id))));
 const restores=data.listings.filter(r=>!lids.has(r.id)&&oids.has(r.acceptedOfferId));
 if(restores.some(r=>r.status!=='RESERVED'))throw Error('Reserved listing state changed.');
 if(targets.length+restores.length>100)throw Error('Cleanup exceeds one transaction.');
 console.log(JSON.stringify({account:email,deletions:Object.fromEntries(names.map(n=>[n,targets.filter(t=>t.name===n).length]).filter(([,count])=>count)),restore:restores.map(r=>({id:r.id,title:r.title,from:r.status,to:'ACTIVE'}))},null,2));
 if(!process.argv.includes('--apply'))process.exit(0);
 for(const name of new Set(targets.map(t=>t.name).concat(restores.length?['listings']:[]))){
  const result=await db.send(new CreateBackupCommand({TableName:'relive-'+name,BackupName:'before-account-cleanup-'+Date.now()}));const BackupArn=result.BackupDetails.BackupArn;let ready=false;
  for(let i=0;i<120;i++){const b=await db.send(new DescribeBackupCommand({BackupArn}));if(b.BackupDescription.BackupDetails.BackupStatus==='AVAILABLE'){ready=true;break;}await new Promise(r=>setTimeout(r,5000));}
  if(!ready)throw Error('Backup not ready; nothing deleted.');console.log('Backup available: '+BackupArn);
 }
 for(const name of names)if(digest(await scan(db,'relive-'+name))!==digest(data[name]))throw Error('Activity occurred during backups; nothing changed. Retry while idle.');
 const writes=targets.map(({name,row})=>({Delete:{TableName:'relive-'+name,Key:marshall({PK:row.PK,SK:row.SK}),...condition(row)}}));
 const updated=restores.map(row=>({...row,status:'ACTIVE',statusPK:'STATUS#ACTIVE',acceptedOfferId:null,version:row.version+1,updatedAt:new Date().toISOString()}));
 restores.forEach((row,i)=>writes.push({Put:{TableName:'relive-listings',Item:marshall(updated[i]),...condition(row)}}));
 await db.send(new TransactWriteItemsCommand({TransactItems:writes}));
 for(const name of names){const after=await scan(db,'relive-'+name);for(const {row} of targets.filter(t=>t.name===name))if(after.some(r=>r.PK===row.PK&&r.SK===row.SK))throw Error('Deletion verification failed.');for(const row of data[name]){if(targets.some(t=>t.name===name&&t.row.PK===row.PK&&t.row.SK===row.SK))continue;const actual=after.find(r=>r.PK===row.PK&&r.SK===row.SK);const expected=name==='listings'?updated.find(r=>r.id===row.id)||row:row;if(!actual||digest(actual)!==digest(expected))throw Error('Retained record verification failed.');}}
 console.log(JSON.stringify({verified:true,deleted:targets.length,reservationsReleased:restores.length,s3ObjectsDeleted:0}));
}catch(error){reportError(error);}

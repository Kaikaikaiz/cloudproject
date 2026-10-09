import { randomUUID } from 'node:crypto';
import { GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { ensureTable, inspect } from './tables.js';
export const historySpec={TableName:'relive-migrations',BillingMode:'PAY_PER_REQUEST',KeySchema:[{AttributeName:'PK',KeyType:'HASH'},{AttributeName:'SK',KeyType:'RANGE'}],AttributeDefinitions:['PK','SK'].map(AttributeName=>({AttributeName,AttributeType:'S'}))};
const TableName=historySpec.TableName;
const lockKey={PK:{S:'LOCK'},SK:{S:'RUNNER'}};
export function checkHistory(migrations, history) {
  let pending=false;
  for(const m of migrations) {
    const saved=history.find(h=>h.SK.S===m.id);
    if(!saved) pending=true;
    else if(pending || saved.checksum.S!==m.checksum) throw new Error(`Migration history mismatch at ${m.id}. Do not edit applied migrations or insert migrations before them.`);
  }
  for(const h of history) if(!migrations.some(m=>m.id===h.SK.S)) throw new Error(`Unknown applied migration ${h.SK.S}; restore its source file.`);
}
async function history(client) {
  const items=[];let cursor;
  do {const r=await client.send(new QueryCommand({TableName,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':{S:'MIGRATION'}},ConsistentRead:true,ExclusiveStartKey:cursor}));items.push(...r.Items||[]);cursor=r.LastEvaluatedKey;}while(cursor);
  return items;
}
export async function runMigrations(client,migrations,{status=false,log=console.log}={}) {
  if(status && !await inspect(client,historySpec)) {for(const m of migrations)log(`PENDING ${m.id}`);return;}
  if(!status) await ensureTable(client,historySpec);
  const owner=randomUUID();let locked=false;
  try {
    if(!status) {
      try {await client.send(new PutItemCommand({TableName,Item:{...lockKey,owner:{S:owner},startedAt:{S:new Date().toISOString()}},ConditionExpression:'attribute_not_exists(PK)'}));locked=true;}
      catch(e){if(e.name==='ConditionalCheckFailedException')throw new Error('Another migration run owns the lock. If it crashed, stop it and use db:unlock with the exact owner shown by db:status.');throw e;}
    }
    const applied=await history(client);checkHistory(migrations,applied);
    for(const m of migrations) {
      if(applied.some(h=>h.SK.S===m.id)){log(`APPLIED ${m.id}`);continue;}
      if(status){log(`PENDING ${m.id}`);continue;}
      log(`RUNNING ${m.id}`);
      await ensureTable(client,m.spec,{recovery:true});
      await client.send(new TransactWriteItemsCommand({TransactItems:[
        {ConditionCheck:{TableName,Key:lockKey,ConditionExpression:'#owner = :owner',ExpressionAttributeNames:{'#owner':'owner'},ExpressionAttributeValues:{':owner':{S:owner}}}},
        {Put:{TableName,Item:{PK:{S:'MIGRATION'},SK:{S:m.id},checksum:{S:m.checksum},completedAt:{S:new Date().toISOString()}},ConditionExpression:'attribute_not_exists(PK)'}},
      ]}));log(`COMPLETED ${m.id}`);
    }
    if(status){const r=await client.send(new GetItemCommand({TableName,Key:lockKey,ConsistentRead:true}));if(r.Item)log(`LOCK owner=${r.Item.owner.S} startedAt=${r.Item.startedAt.S}`);}
  } finally {
    if(locked) {
      try {await unlock(client,owner);}
      catch(e){log(`Lock release failed (${e.name}). Retained owner: ${owner}. Use db:status after credentials/permissions are fixed.`);throw e;}
    }
  }
}
export async function unlock(client,owner) {
  if(!owner)throw new Error('Provide the exact lock owner. Stop the old process before releasing its lock.');
  await client.send(new DeleteItemCommand({TableName,Key:lockKey,ConditionExpression:'#owner = :owner',ExpressionAttributeNames:{'#owner':'owner'},ExpressionAttributeValues:{':owner':{S:owner}}}));
}

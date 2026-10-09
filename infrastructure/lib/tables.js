import { DescribeTableCommand, CreateTableCommand, UpdateTableCommand, DescribeContinuousBackupsCommand, UpdateContinuousBackupsCommand } from '@aws-sdk/client-dynamodb';
export const keys = (pk, sk) => [{ AttributeName: pk, KeyType: 'HASH' }, ...(sk ? [{ AttributeName: sk, KeyType: 'RANGE' }] : [])];
const same = (a, b) => JSON.stringify([...a].sort((x,y)=>x.AttributeName.localeCompare(y.AttributeName))) === JSON.stringify([...b].sort((x,y)=>x.AttributeName.localeCompare(y.AttributeName)));
export async function poll(check, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let i=0;i<120;i++) { const value=await check(); if(value) return value; await sleep(5000); }
  throw new Error('AWS resource did not become ready in 10 minutes; rerun after checking its status.');
}
export async function inspect(client, spec) {
  try { return (await client.send(new DescribeTableCommand({TableName:spec.TableName}))).Table; }
  catch(e) { if(e.name==='ResourceNotFoundException') return null; throw e; }
}
export function validate(table, spec) {
  if(!same(table.KeySchema, spec.KeySchema) || !same(table.AttributeDefinitions, spec.AttributeDefinitions) || table.BillingModeSummary?.BillingMode !== 'PAY_PER_REQUEST') throw new Error(`${spec.TableName}: existing keys, attribute types or capacity differ. No table was replaced.`);
  const actual=table.GlobalSecondaryIndexes || [], wanted=spec.GlobalSecondaryIndexes || [];
  if(actual.length!==wanted.length || wanted.some(i=>!actual.some(a=>a.IndexName===i.IndexName && same(a.KeySchema,i.KeySchema) && a.Projection.ProjectionType===i.Projection.ProjectionType))) throw new Error(`${spec.TableName}: existing indexes differ. Add an explicit migration to change them.`);
}
export async function ensureTable(client, spec, { recovery=false }={}) {
  let table=await inspect(client,spec);
  if(!table) {
    try { await client.send(new CreateTableCommand(spec)); }
    catch(e) { if(e.name!=='ResourceInUseException') throw e; }
  }
  table=await poll(async()=>{const t=await inspect(client,spec);return t?.TableStatus==='ACTIVE' && (t.GlobalSecondaryIndexes||[]).every(i=>i.IndexStatus==='ACTIVE') ? t : null;});
  validate(table,spec);
  if(spec.StreamSpecification && (!table.StreamSpecification?.StreamEnabled || table.StreamSpecification.StreamViewType!==spec.StreamSpecification.StreamViewType)) {
    await client.send(new UpdateTableCommand({TableName:spec.TableName,StreamSpecification:spec.StreamSpecification}));
    await poll(async()=>{const t=await inspect(client,spec);return t.TableStatus==='ACTIVE' && t.StreamSpecification?.StreamEnabled && t.StreamSpecification.StreamViewType===spec.StreamSpecification.StreamViewType;});
  }
  if(recovery) {
    const status=async()=>(await client.send(new DescribeContinuousBackupsCommand({TableName:spec.TableName}))).ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus;
    if(await status()!=='ENABLED') await client.send(new UpdateContinuousBackupsCommand({TableName:spec.TableName,PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true}}));
    await poll(async()=>await status()==='ENABLED');
  }
}

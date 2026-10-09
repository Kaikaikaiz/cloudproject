import test from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations, historySpec, checkHistory, unlock } from '../lib/migrations.js';
import { validate } from '../lib/tables.js';
import spec from '../migrations/002-create-users.js';
const migration={id:'001-test',checksum:'abc',spec};
function fake({failRecovery=false}={}) {
 const tables=new Map([[historySpec.TableName,{...historySpec,TableStatus:'ACTIVE',BillingModeSummary:{BillingMode:'PAY_PER_REQUEST'}}]]),items=new Map();let creates=0;
 const conditional=()=>{const e=new Error('conditional');e.name='ConditionalCheckFailedException';throw e;};
 const client={async send(command){const p=command.input;switch(command.constructor.name){
 case 'DescribeTableCommand':if(!tables.has(p.TableName)){const e=new Error();e.name='ResourceNotFoundException';throw e;}return {Table:tables.get(p.TableName)};
 case 'CreateTableCommand':creates++;tables.set(p.TableName,{...p,TableStatus:'ACTIVE',BillingModeSummary:{BillingMode:'PAY_PER_REQUEST'}});return {};
 case 'PutItemCommand':if(items.has('lock'))conditional();items.set('lock',p.Item);return {};
 case 'DeleteItemCommand':if(items.get('lock')?.owner.S!==p.ExpressionAttributeValues[':owner'].S)conditional();items.delete('lock');return {};
 case 'QueryCommand':return {Items:[...items.entries()].filter(([k])=>k!=='lock').map(([,v])=>v)};
 case 'GetItemCommand':return {Item:items.get('lock')};
 case 'DescribeContinuousBackupsCommand':if(failRecovery)throw Error('PITR denied');return {ContinuousBackupsDescription:{PointInTimeRecoveryDescription:{PointInTimeRecoveryStatus:'ENABLED'}}};
 case 'TransactWriteItemsCommand':assert.equal(items.get('lock').owner.S,p.TransactItems[0].ConditionCheck.ExpressionAttributeValues[':owner'].S);items.set(p.TransactItems[1].Put.Item.SK.S,p.TransactItems[1].Put.Item);return {};
 default:throw Error(command.constructor.name);
 }}};
 return {client,items,tables,get creates(){return creates;}};
}
test('creates, records, reruns without resource creation and releases lock',async()=>{const f=fake();await runMigrations(f.client,[migration],{log:()=>{}});assert.equal(f.creates,1);assert.ok(f.items.has('001-test'));assert.ok(!f.items.has('lock'));await runMigrations(f.client,[migration],{log:()=>{}});assert.equal(f.creates,1);});
test('adopts matching table without recreation',async()=>{const f=fake();f.tables.set(spec.TableName,{...spec,TableStatus:'ACTIVE',BillingModeSummary:{BillingMode:'PAY_PER_REQUEST'}});await runMigrations(f.client,[migration],{log:()=>{}});assert.equal(f.creates,0);});
test('failure is not marked complete and lock is released',async()=>{const f=fake({failRecovery:true});await assert.rejects(runMigrations(f.client,[migration],{log:()=>{}}),/PITR denied/);assert.equal(f.items.size,0);});
test('concurrent runner cannot enter or delete another lock',async()=>{const f=fake();f.items.set('lock',{owner:{S:'other'}});await assert.rejects(runMigrations(f.client,[migration]),/Another migration/);await assert.rejects(unlock(f.client,'wrong'));assert.equal(f.items.get('lock').owner.S,'other');});
test('status on fresh account creates nothing',async()=>{const f=fake();f.tables.clear();const logs=[];await runMigrations(f.client,[migration],{status:true,log:x=>logs.push(x)});assert.deepEqual(logs,['PENDING 001-test']);assert.equal(f.creates,0);});
test('modified, unknown and out-of-order migrations are rejected',()=>{assert.throws(()=>checkHistory([migration],[{SK:{S:'001-test'},checksum:{S:'changed'}}]),/mismatch/);assert.throws(()=>checkHistory([],[{SK:{S:'unknown'}}]),/Unknown/);assert.throws(()=>checkHistory([{...migration,id:'000-before'},migration],[{SK:{S:'001-test'},checksum:{S:'abc'}}]),/mismatch/);});
test('schema and capacity mismatches stop adoption',()=>{assert.throws(()=>validate({...spec,KeySchema:[],BillingModeSummary:{BillingMode:'PAY_PER_REQUEST'}},spec),/differ/);assert.throws(()=>validate({...spec,BillingModeSummary:{BillingMode:'PROVISIONED'}},spec),/differ/);});

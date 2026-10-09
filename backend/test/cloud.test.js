import test from 'node:test';
import assert from 'node:assert/strict';
import serverlessExpress from '@codegenie/serverless-express';
import { createCloudApp } from '../src/cloud/app.js';
import { normalizeGatewayEvent } from '../src/cloud/gateway-event.js';
test('Lambda proxy auth, owner checks, stale edits, soft deletion and token revocation', async () => {
 process.env.JWT_SECRET='test-cloud-secret-at-least-thirty-two-characters';
 const users=new Map(), listings=new Map();
 const clone=x=>x&&structuredClone(x);
 const conflict=()=>{const e=new Error();e.name='ConditionalCheckFailedException';throw e;};
 const store={user:async id=>clone(users.get(id)),userByEmail:async email=>clone([...users.values()].find(u=>u.email===email)),register:async u=>{if([...users.values()].some(v=>v.email===u.email))conflict();users.set(u.id,clone(u));},logout:async id=>users.get(id).tokenVersion++,listing:async id=>clone(listings.get(id)),listings:async seller=>[...listings.values()].filter(l=>seller?l.sellerId===seller:l.status==='ACTIVE').map(clone),saveListing:async(l,old)=>{if(old&&listings.get(old.id).version!==old.version)conflict();listings.set(l.id,clone(l));}};
 const handler=serverlessExpress({app:createCloudApp({store,images:{url:async()=>null,finalize:async()=>[]},origins:['http://example.test']})});
 async function req(method,path,body,token,origin='http://example.test'){
 const r=await handler(normalizeGatewayEvent({resource:'/api/{proxy+}',pathParameters:{proxy:path.slice(1)},path:'/api'+path,httpMethod:method,headers:{'content-type':'application/json',origin,...(token?{authorization:'Bearer '+token}:{})},requestContext:{stage:'v1',identity:{sourceIp:'127.0.0.1'}},body:body?JSON.stringify(body):null,isBase64Encoded:false}),{awsRequestId:'test'});
 return {status:r.statusCode,data:r.body?JSON.parse(r.body):{}};
 }
 const account={name:'Test User',email:'one@example.test',password:'test-password-123'};
 const first=await req('POST','/auth/register',account);assert.equal(first.status,201);assert.equal(first.data.user.passwordHash,undefined);
 assert.equal((await req('POST','/auth/register',account)).status,409);
 const second=await req('POST','/auth/register',{...account,email:'two@example.test'});
 const token=first.data.token;
 const values={title:'Test book',description:'A useful textbook in good condition',category:'Books & Education',condition:'Good',state:'Selangor',city:'Shah Alam',price:'25',images:[]};
 assert.equal((await req('POST','/listings',values)).status,401);
 assert.equal((await req('POST','/listings',values,token,'http://evil.test')).status,403);
 const created=await req('POST','/listings',values,token);assert.equal(created.status,201);
 const l=created.data.listing;assert.equal(l.price,25);assert.equal(listings.get(l.id).price,2500);
 assert.equal((await req('PUT','/listings/'+l.id,{...values,updatedAt:l.updatedAt},second.data.token)).status,403);
 assert.equal((await req('PUT','/listings/'+l.id,{...values,price:'20',updatedAt:l.updatedAt},token)).data.listing.price,20);
 assert.equal((await req('PUT','/listings/'+l.id,{...values,updatedAt:l.updatedAt},token)).status,409);
 assert.equal((await req('DELETE','/listings/'+l.id,null,second.data.token)).status,403);
 assert.equal((await req('DELETE','/listings/'+l.id,null,token)).status,200);
 assert.equal((await req('GET','/listings')).data.total,0);
 assert.equal((await req('GET','/listings/'+l.id,null,second.data.token)).status,404);
 assert.equal((await req('POST','/auth/logout',{},token)).status,200);
 assert.equal((await req('GET','/auth/me',null,token)).status,401);
 assert.equal((await req('OPTIONS','/listings')).status,204);
 assert.equal((await req('GET','/wallet')).status,501);
});

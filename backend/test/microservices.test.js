import test from 'node:test';
import assert from 'node:assert/strict';
import serverlessExpress from '@codegenie/serverless-express';
import { createCloudApp } from '../src/cloud/app.js';
import { routes, services } from '../../infrastructure/services.js';
import { signToken } from '../src/lib/jwt.js';
test('each route is registered only in its target service; JWT works across services', async()=>{
 process.env.JWT_SECRET='shared-microservice-test-secret-32-characters';
 const user={id:'test',tokenVersion:0,role:'USER'};
 const store=new Proxy({}, {get:(_,key)=>async()=>{if(key==='user')return user;if(key==='listings'||key==='favourites')return [];const e=new Error('Reached data operation');e.status=422;throw e;}});
 const images={url:async()=>null,upload:async()=>({reference:'test'})};
 const handlers=Object.fromEntries(services.map(service=>[service,serverlessExpress({app:createCloudApp({services:[service],store,images})})]));
 for(const [target,path,methods] of routes)for(const method of methods){
  for(const service of services){
   const response=await handlers[service]({resource:path,path:path.replace('{id}','test'),httpMethod:method,headers:{'content-type':'application/json',authorization:`Bearer ${signToken('test',0)}`},requestContext:{identity:{sourceIp:'127.0.0.1'}},body:'{}',isBase64Encoded:false},{awsRequestId:'test'});
   if(service!==target)assert.equal(response.statusCode,404,`${service} must not serve ${method} ${path}`);
   else assert.notEqual(JSON.parse(response.body||'{}').error,'Route not found.',`${service} ${path}`);
  }
 }
});

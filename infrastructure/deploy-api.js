import { services, routes } from './services.js';
import { readFile, writeFile } from 'node:fs/promises';
import * as API from '@aws-sdk/client-api-gateway';
import { LambdaClient, AddPermissionCommand } from '@aws-sdk/client-lambda';
import { region, expectedAccount, verifyAccount, reportError } from './config.js';
try {
  if (!process.argv.includes('--apply')) throw new Error('API cutover requires explicit --apply. No AWS changes made.');
  await verifyAccount();
  const client = new API.APIGatewayClient({ region });
  const send = (name, input) => client.send(new API[name](input));
  const apis = [];
  let position;
  do { const result = await send('GetRestApisCommand', { position, limit: 500 }); apis.push(...result.items); position = result.position; } while (position);
  const matches = apis.filter(api => api.name === 'relive-api');
  if (matches.length > 1) throw new Error('Multiple relive-api APIs exist. Resolve duplicates first.');
  const api = matches[0] || await send('CreateRestApiCommand', { name: 'relive-api', endpointConfiguration: { types: ['REGIONAL'] } });
  const restApiId = api.id;
  const resources = [];
  position = undefined;
  do { const result = await send('GetResourcesCommand', { restApiId, position, limit: 500 }); resources.push(...result.items); position = result.position; } while (position);
  async function resource(path) {
    const existing = resources.find(item => item.path === path);
    if (existing) return existing;
    const parts = path.split('/').filter(Boolean);
    const pathPart = parts.pop();
    const parent = await resource('/' + parts.join('/'));
    const item = await send('CreateResourceCommand', { restApiId, parentId: parent.id, pathPart });
    resources.push(item); return item;
  }

  const origin = process.env.FRONTEND_ORIGIN || 'http://relive-web-cloudproject.s3-website-us-east-1.amazonaws.com';
  const requireApiKey = process.env.API_KEY_REQUIRED === 'true';
  // Concrete CRUD methods make the assignment's HTTP method mapping visible.
  for (const [service, path, methods] of routes) {
    const functionArn = `arn:aws:lambda:${region}:${expectedAccount}:function:relive-${service}`;
    const { id: resourceId } = await resource(path);
    for (const httpMethod of [...methods, 'OPTIONS']) {
      const params = { restApiId, resourceId, httpMethod };
      const publicRoute = path === '/api/health' || ['/api/auth/register', '/api/auth/login', '/api/auth/forgot-password'].includes(path);
      try { await send('PutMethodCommand', { ...params, authorizationType: 'NONE', apiKeyRequired: requireApiKey && !publicRoute && httpMethod !== 'OPTIONS' }); }
      catch (error) {
        if (error.name !== 'ConflictException') throw error;
        if (process.env.API_KEY_REQUIRED !== undefined || httpMethod === 'OPTIONS') await send('UpdateMethodCommand', { ...params, patchOperations: [{ op: 'replace', path: '/apiKeyRequired', value: String(requireApiKey && !publicRoute && httpMethod !== 'OPTIONS') }] });
      }
      await send('PutIntegrationCommand', { ...params, type: 'AWS_PROXY', integrationHttpMethod: 'POST', uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${functionArn}/invocations` });
    }
  }
  const lambda = new LambdaClient({ region });
  for (const service of services) {
  try { await lambda.send(new AddPermissionCommand({ FunctionName: `relive-${service}`, StatementId: `gateway-${restApiId}`, Action: 'lambda:InvokeFunction', Principal: 'apigateway.amazonaws.com', SourceArn: `arn:aws:execute-api:${region}:${expectedAccount}:${restApiId}/*/*/*`, SourceAccount: expectedAccount })); }
  catch (error) { if (error.name !== 'ResourceConflictException') throw error; }
  }
  for (const responseType of ['DEFAULT_4XX', 'DEFAULT_5XX']) await send('PutGatewayResponseCommand', { restApiId, responseType,
    responseParameters: { 'gatewayresponse.header.Access-Control-Allow-Origin': `'${origin}'`, 'gatewayresponse.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Api-Key'" },
  });
  // Retain the old /api/{proxy+} fallback and legacy Lambda; no resources deleted.
  await send('CreateDeploymentCommand', { restApiId, stageName: 'v1' });
  await send('UpdateStageCommand', { restApiId, stageName: 'v1', patchOperations: [
    { op: 'replace', path: '/*/*/throttling/rateLimit', value: '5' },
    { op: 'replace', path: '/*/*/throttling/burstLimit', value: '10' },
  ] });
  // Provision a reusable usage plan and API key. Keys remain optional by
  // default so the existing browser client stays compatible; set
  // API_KEY_REQUIRED=true before deployment to require it on each method.
  const plans = await send('GetUsagePlansCommand', { limit: 500 });
  let plan = plans.items?.find(item => item.name === 'relive-v1-plan');
  if (!plan) plan = await send('CreateUsagePlanCommand', { name: 'relive-v1-plan', description: 'reLIVE coursework API protection', throttle: { rateLimit: 5, burstLimit: 10 }, quota: { limit: 10000, period: 'DAY' }, apiStages: [{ apiId: restApiId, stage: 'v1' }] });
  else if (!plan.apiStages?.some(stage => stage.apiId === restApiId && stage.stage === 'v1')) await send('UpdateUsagePlanCommand', { usagePlanId: plan.id, patchOperations: [{ op: 'add', path: '/apiStages', value: `${restApiId}:v1` }] });
  const keys = await send('GetApiKeysCommand', { includeValues: false, limit: 500 });
  let key = keys.items?.find(item => item.name === 'relive-v1-client');
  if (!key) key = await send('CreateApiKeyCommand', { name: 'relive-v1-client', enabled: true, description: 'reLIVE coursework browser client key' });
  const planKeys = await send('GetUsagePlanKeysCommand', { usagePlanId: plan.id, limit: 500 });
  if (!planKeys.items?.some(item => item.id === key.id)) await send('CreateUsagePlanKeyCommand', { usagePlanId: plan.id, keyId: key.id, keyType: 'API_KEY' });
  console.log(`Usage plan relive-v1-plan ready; API key id ${key.id}. Retrieve its value in the console before enabling API_KEY_REQUIRED.`);
  const url = `https://${restApiId}.execute-api.${region}.amazonaws.com/v1/api`;
  const envPath = new URL('../frontend/.env.production.local', import.meta.url);
  const oldEnv = await readFile(envPath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return ''; });
  const kept = oldEnv.split('\n').filter(line => !/^VITE_(CLOUD_MODE|API_URL)=/.test(line)).join('\n').trim();
  await writeFile(envPath, `${kept ? kept + '\n' : ''}VITE_CLOUD_MODE=true\nVITE_API_URL=${url}\n`);
  console.log(`Deployed ${url}\nFrontend production configuration written. Check ${url}/health before rebuilding the website.`);
  console.log('JWT authentication and commerce routes configured. Verify dashboard, offers and simulated payments after deployment.');
} catch (error) { reportError(error); }

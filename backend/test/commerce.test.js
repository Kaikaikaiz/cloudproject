import test from 'node:test';
import assert from 'node:assert/strict';
import serverlessExpress from '@codegenie/serverless-express';
import { createStore } from '../src/cloud/store.js';
import { createContext } from '../src/cloud/context.js';
import { createCommerce } from '../src/cloud/commerce.js';
import { createCloudApp } from '../src/cloud/app.js';
import { signToken } from '../src/lib/jwt.js';

// Small DynamoDB transaction emulator: evaluates all CAS conditions before any
// writes, so tests exercise the production store's transaction boundaries.
function setup() {
  const rows = new Map(),
    key = (table, item) => JSON.stringify([table, item.PK, item.SK]);
  const copy = (x) => x && structuredClone(x);
  const client = {
    async send(command) {
      const p = command.input;
      if (command.constructor.name === 'GetCommand')
        return { Item: copy(rows.get(key(p.TableName, p.Key))) };
      if (command.constructor.name === 'QueryCommand') {
        const v = p.ExpressionAttributeValues;
        return {
          Items: [...rows.entries()]
            .filter(([k]) => JSON.parse(k)[0] === p.TableName)
            .map(([, r]) => r)
            .filter((r) =>
              p.IndexName
                ? r[p.ExpressionAttributeNames?.['#pk'] || (p.IndexName === 'SellerIndex' ? 'sellerPK' : 'statusPK')] === v[':pk']
                : r.PK === v[':pk'] && (!v[':prefix'] || r.SK.startsWith(v[':prefix'])),
            )
            .map(copy),
        };
      }
      assert.equal(command.constructor.name, 'TransactWriteCommand');
      assert.ok(p.TransactItems.length <= 100);
      const keys = p.TransactItems.map(({ Put }) => key(Put.TableName, Put.Item));
      assert.equal(new Set(keys).size, keys.length, 'no duplicate transaction targets');
      for (const { Put } of p.TransactItems) {
        const old = rows.get(key(Put.TableName, Put.Item));
        if (
          Put.ConditionExpression === 'attribute_not_exists(PK)'
            ? !!old
            : old?.version !== (Put.ExpressionAttributeValues[':v'] ?? Put.ExpressionAttributeValues[':version'])
        ) {
          const error = new Error('Conflict');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
      }
      for (const { Put } of p.TransactItems)
        rows.set(key(Put.TableName, Put.Item), copy(Put.Item));
      return {};
    },
  };
  const put = (table, item) => rows.set(key(table, item), copy(item));
  for (const id of ['seller', 'buyer', 'other'])
    put('users', {
      PK: `USER#${id}`,
      SK: 'PROFILE',
      id,
      name: id,
      role: 'USER',
      version: 0,
      tokenVersion: 0,
      walletBalance: 0,
      completedTransactions: 0,
      totalReviews: 0,
      averageRating: 0,
      createdAt: new Date().toISOString(),
    });
  for (const id of ['seller', 'buyer', 'other']) put('relive-wallet', { PK:`USER#${id}`,SK:'BALANCE',id,version:0,walletBalance:0 });
  const listing = (id = 'book', price = 2500) =>
    put('listings', {
      PK: `LISTING#${id}`,
      SK: 'DETAILS',
      id,
      sellerId: 'seller',
      sellerPK: 'USER#seller',
      statusPK: 'STATUS#ACTIVE',
      status: 'ACTIVE',
      version: 0,
      price,
      title: 'Test book',
      images: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  listing();
  const store = createStore({ client, usersTable: 'users', listingsTable: 'listings' });
  const images = { url: async () => null };
  const service = createCommerce(createContext(store, images));
  return { service, store, listing, images, rows, client };
}
const topUp = async (s, user, amount = 100) => {
  const { topUp } = await s.createTopUp(user, {
    amount,
    method: 'FPX',
    requestKey: 'topup-request-key-0001',
  });
  await s.settleTopUp(user, topUp.id, 'confirm');
  return topUp;
};
test('top-ups are private, idempotent and atomic under concurrent confirmation', async () => {
  const { service: s, store } = setup();
  const body = { amount: 100, method: 'FPX', requestKey: 'topup-request-key-0001' };
  const { topUp: t } = await s.createTopUp('buyer', body);
  assert.equal((await s.createTopUp('buyer', body)).created, false);
  await assert.rejects(
    s.createTopUp('buyer', { ...body, amount: 200 }),
    (e) => e.status === 409,
  );
  await assert.rejects(s.topUp('other', t.id), (e) => e.status === 403);
  const results = await Promise.allSettled([
    s.settleTopUp('buyer', t.id, 'confirm'),
    s.settleTopUp('buyer', t.id, 'confirm'),
  ]);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  assert.equal((await store.user('buyer')).walletBalance, 10000);
  await s.settleTopUp('buyer', t.id, 'confirm');
  assert.equal((await s.wallet('buyer')).balance, 100);
  await assert.rejects(s.settleTopUp('buyer', t.id, 'cancel'), (e) => e.status === 409);
  const cancelled = (
    await s.createTopUp('buyer', { ...body, requestKey: 'topup-request-key-0002' })
  ).topUp;
  await s.settleTopUp('buyer', cancelled.id, 'cancel');
  await assert.rejects(
    s.settleTopUp('buyer', cancelled.id, 'confirm'),
    (e) => e.status === 409,
  );
});
test('offers enforce turns, duplicate protection and atomic reservation; purchase settles once', async () => {
  const { service: s, store } = setup();
  await assert.rejects(
    s.makeOffer('seller', { listingId: 'book', amount: 20 }),
    (e) => e.status === 403,
  );
  const a = await s.makeOffer('buyer', { listingId: 'book', amount: 20 });
  await assert.rejects(
    s.makeOffer('buyer', { listingId: 'book', amount: 21 }),
    (e) => e.status === 409,
  );
  await assert.rejects(s.offer('other', a.id), (e) => e.status === 403);
  await assert.rejects(
    s.act('buyer', a.id, { action: 'accept', version: 0 }),
    (e) => e.status === 403,
  );
  const counter = await s.act('seller', a.id, {
    action: 'counter',
    version: 0,
    amount: 22,
  });
  const competitor = await s.makeOffer('other', { listingId: 'book', amount: 23 });
  const race = await Promise.allSettled([
    s.act('buyer', a.id, { action: 'accept', version: counter.version }),
    s.act('seller', competitor.id, { action: 'accept', version: 0 }),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  const reserved = await store.listing('book');
  const offer = await store.commerce.record('OFFER', reserved.acceptedOfferId);
  const loserId = offer.id === a.id ? competitor.id : a.id;
  assert.equal(
    (await s.offer(offer.id === a.id ? 'other' : 'buyer', loserId)).status,
    'CLOSED',
  );
  await assert.rejects(s.quote(offer.buyerId, 'book'), (e) => e.status === 409);
  await topUp(s, offer.buyerId);
  const q = await s.quote(offer.buyerId, 'book', offer.id);
  const body = {
    listingId: 'book',
    offerId: offer.id,
    expectedAmount: q.amount,
    listingUpdatedAt: q.listingUpdatedAt,
    requestKey: 'purchase-request-key-001',
  };
  await assert.rejects(
    s.buy(offer.buyerId, { ...body, expectedAmount: 1 }),
    (e) => e.status === 409,
  );
  const result = await s.buy(offer.buyerId, body);
  assert.equal((await s.buy(offer.buyerId, body)).created, false);
  assert.equal((await store.listing('book')).status, 'SOLD');
  assert.equal((await s.wallet('seller')).balance, q.amount);
  assert.equal((await s.wallet(offer.buyerId)).balance, 100 - q.amount);
  assert.equal((await s.offer(offer.buyerId, offer.id)).status, 'COMPLETED');
  assert.equal((await s.transactions('seller', 'sales')).length, 1);
  await assert.rejects(
    s.purchase(offer.buyerId === 'buyer' ? 'other' : 'buyer', result.purchase.id),
    (e) => e.status === 403,
  );
  await s.review(offer.buyerId, result.purchase.id, {
    rating: 5,
    comment: 'Great seller',
  });
  await assert.rejects(
    s.review(offer.buyerId, result.purchase.id, { rating: 1 }),
    (e) => e.status === 409,
  );
  assert.equal((await store.user('seller')).averageRating, 5);
  assert.equal((await store.commerce.records('seller', 'REVIEW')).length, 1);
  assert.equal((await s.dashboard('seller')).counts.sales, 1);
  await s.readNotifications('seller');
  assert.equal((await s.dashboard('seller')).unreadNotifications, 0);
});
test('Buy Now rejects insufficient funds and concurrent purchases conserve balances', async () => {
  const { service: s, store, listing } = setup();
  listing('second', 7500);
  const body = async (id) => {
    const q = await s.quote('buyer', id);
    return {
      listingId: id,
      expectedAmount: q.amount,
      listingUpdatedAt: q.listingUpdatedAt,
      requestKey: `purchase-key-${id}-0001`,
    };
  };
  await assert.rejects(s.buy('buyer', await body('book')), (e) => e.status === 402);
  assert.equal((await store.listing('book')).status, 'ACTIVE');
  await topUp(s, 'buyer', 80);
  const [a, b] = await Promise.all([body('book'), body('second')]);
  const results = await Promise.allSettled([s.buy('buyer', a), s.buy('buyer', b)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await store.user('buyer')).walletBalance +
      (await store.user('seller')).walletBalance,
    8000,
  );
  assert.equal((await s.transactions('buyer')).length, 1);
});
test('cloud HTTP routes preserve response shapes and require JWT', async () => {
  process.env.JWT_SECRET = 'commerce-tests-secret-with-at-least-32-characters';
  const { store, images } = setup();
  const handler = serverlessExpress({ app: createCloudApp({ store, images }) });
  async function request(method, path, body, authorized = true) {
    const r = await handler(
      {
        resource: path,
        path,
        httpMethod: method,
        headers: {
          'content-type': 'application/json',
          ...(authorized ? { authorization: 'Bearer ' + signToken('buyer', 0) } : {}),
        },
        requestContext: { identity: { sourceIp: '127.0.0.1' } },
        body: JSON.stringify(body || {}),
        isBase64Encoded: false,
      },
      { awsRequestId: 'test' },
    );
    return { status: r.statusCode, data: JSON.parse(r.body) };
  }
  assert.equal((await request('GET', '/api/wallet', null, false)).status, 401);
  assert.equal((await request('GET', '/api/wallet')).data.balance, 0);
  assert.equal((await request('GET', '/api/dashboard')).data.counts.purchases, 0);
  assert.deepEqual((await request('GET', '/api/offers')).data.offers, []);
  const created = await request('POST', '/api/wallet/top-ups', {
    amount: 50,
    method: 'TNG',
    requestKey: 'http-request-key-0001',
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await request('POST', `/api/wallet/top-ups/${created.data.topUp.id}/confirm`)).data
      .topUp.status,
    'SUCCESS',
  );
  assert.equal((await request('GET', '/api/wallet')).data.balance, 50);
});

test('domain storage separates balances, histories and notifications from profiles',async()=>{
 const {service:s,store,rows}=setup();
 const before=await store.user('buyer');
 await topUp(s,'buyer',100);
 const after=await store.user('buyer');
 assert.equal(after.version,before.version,'top-up must not mutate profile version');
 assert.equal(after.balanceVersion,before.balanceVersion+1);
 const offer=await s.makeOffer('buyer',{listingId:'book',amount:20});
 await s.act('seller',offer.id,{action:'counter',version:offer.version,amount:21});
 const all=[...rows.entries()];
 const offers=all.filter(([key])=>JSON.parse(key)[0]==='relive-offers').map(([,v])=>v);
 assert.equal(offers.find(o=>o.SK==='DETAILS'&&o.id===offer.id).history,undefined);
 assert.equal(offers.filter(o=>o.SK.startsWith('HISTORY#')).length,2);
 assert.ok(all.some(([key,v])=>JSON.parse(key)[0]==='relive-notifications'&&v.PK==='USER#seller'&&v.message));
 assert.equal(all.filter(([key])=>JSON.parse(key)[0]==='users').length,3,'commerce must not add records to users table');
});

test('cloud reports validate ownership and moderation cannot reactivate sold items',async()=>{
 const {createModeration}=await import('../src/cloud/moderation.js');
 const {store,images,service,listing,rows}=setup();
 const moderation=createModeration(createContext(store,images));
 await assert.rejects(moderation.submit({id:'seller',role:'USER'},{listingId:'book',reason:'Other'}),e=>e.status===403);
 await assert.rejects(moderation.submit({id:'buyer',role:'ADMIN'},{listingId:'book',reason:'Other'}),e=>e.status===403);
 const offer=await service.makeOffer('buyer',{listingId:'book',amount:20});
 const report=await moderation.submit({id:'buyer',role:'USER'},{listingId:'book',reason:'Misleading Information'});
 await assert.rejects(moderation.submit({id:'buyer',role:'USER'},{listingId:'book',reason:'Other'}),e=>e.status===409);
 async function act(action){const current=await moderation.get(report.id);return moderation.act(report.id,{action,version:current.version,listingUpdatedAt:current.listing.updatedAt,adminReason:'Reviewed by administrator'});}
 assert.equal((await moderation.list()).counts.pending,1);
 await act('investigate');
 assert.equal((await store.listing('book')).status,'UNDER_REVIEW');
 await act('revision');
 assert.equal((await store.listing('book')).status,'NEEDS_REVISION');
 assert.equal((await store.commerce.records('seller','NOTICE')).some(n=>n.message.includes('requires revision')),true);
 await act('dismiss');
 assert.equal((await store.listing('book')).status,'ACTIVE');
 assert.equal((await service.offer('buyer',offer.id)).status,'CLOSED','moderated offers stay closed after restore');
 await assert.rejects(service.act('seller',offer.id,{action:'accept',version:0}),e=>e.status===409);
 const report2=await moderation.submit({id:'other',role:'USER'},{listingId:'book',reason:'Other'});
 const currentListing=await store.listing('book');
 await store.commerce.commit([{type:'LISTING',old:currentListing,item:{...currentListing,status:'SOLD',statusPK:'STATUS#SOLD',version:currentListing.version+1,updatedAt:new Date(Date.parse(currentListing.updatedAt)+1).toISOString()}}]);
 const r=await moderation.get(report2.id);
 const removed=await moderation.act(report2.id,{action:'remove',version:r.version,listingUpdatedAt:r.listing.updatedAt,adminReason:'Remove misleading content'});
 const restored=await moderation.act(report2.id,{action:'restore',version:removed.version,listingUpdatedAt:removed.listing.updatedAt,adminReason:'Restore record visibility'});
 assert.equal(restored.listing.status,'SOLD');
 await assert.rejects(moderation.act(report2.id,{action:'restore',version:0,listingUpdatedAt:r.listing.updatedAt,adminReason:'Stale request'}),e=>e.status===409);
});

test('admin HTTP endpoints reject members and allow explicit administrator role',async()=>{
 process.env.JWT_SECRET='moderation-tests-secret-with-at-least-32-characters';
 const {store,images,rows}=setup();
 const seller=await store.user('seller');
 await store.saveUser(seller,{...seller,role:'ADMIN',version:seller.version+1});
 const handler=serverlessExpress({app:createCloudApp({store,images})});
 async function request(user){const result=await handler({resource:'/api/admin/reports',path:'/api/admin/reports',httpMethod:'GET',headers:user?{authorization:'Bearer '+signToken(user,0)}:{},requestContext:{identity:{sourceIp:'127.0.0.1'}},body:null,isBase64Encoded:false},{awsRequestId:'test'});return result;}
 assert.equal((await request(null)).statusCode,401);
 assert.equal((await request('buyer')).statusCode,403);
 const response=await request('seller');assert.equal(response.statusCode,200);assert.deepEqual(JSON.parse(response.body).counts,{pending:0,reviewing:0,resolved:0});
});

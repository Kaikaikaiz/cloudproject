import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('mock wallet payments and atomic purchases', async (suite) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'relive-payments-'));
  const databasePath = path.join(directory, 'payments.db');

  process.env.DATABASE_URL = 'file:' + databasePath.replaceAll('\\', '/');
  process.env.JWT_SECRET = 'isolated-payment-test-secret-at-least-32-characters';

  const database = new DatabaseSync(databasePath);
  const migrationsDirectory = new URL('../prisma/migrations/', import.meta.url);

  for (const migration of (await readdir(migrationsDirectory)).sort()) {
    if (migration !== 'migration_lock.toml') {
      const migrationPath = new URL(migration + '/migration.sql', migrationsDirectory);
      database.exec(await readFile(migrationPath, 'utf8'));
    }
  }

  database.close();

  const { app } = await import('../src/app.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const { signToken } = await import('../src/lib/jwt.js');
  const { hashPassword } = await import('../src/lib/password.js');
  const passwordHash = await hashPassword('isolated-payment-test-password');
  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));

  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';

  async function request(
    route,
    user,
    body,
    method = body === undefined ? 'GET' : 'POST',
  ) {
    const response = await fetch(baseUrl + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { Authorization: 'Bearer ' + user.token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return { status: response.status, body: await response.json() };
  }

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        name: 'Payment tester',
        email: randomUUID() + '@payments.test',
        passwordHash,
      },
    });

    return { ...user, token: signToken(user.id) };
  }

  async function createListing(seller, price = 50) {
    const result = await request('/listings', seller, {
      title: 'Second-hand desk',
      description: 'A sturdy wooden desk ready for another home.',
      price,
      category: 'Home & Living',
      condition: 'Good',
      state: 'Selangor',
      city: 'Petaling Jaya',
      images: [],
    });

    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.listing;
  }

  async function topUp(user, amount, method = 'FPX') {
    const result = await request('/wallet/top-ups', user, {
      amount,
      method,
      requestKey: randomUUID(),
    });
    assert.equal(result.status, 201);

    const confirmed = await request(
      '/wallet/top-ups/' + result.body.topUp.id + '/confirm',
      user,
      {},
    );
    assert.equal(confirmed.status, 200);
    return confirmed.body.topUp;
  }

  async function checkout(user, listing, offerId = null) {
    const query = new URLSearchParams({ listingId: listing.id });
    if (offerId) {
      query.set('offerId', offerId);
    }

    const result = await request('/purchases/quote?' + query, user);
    assert.equal(result.status, 200, JSON.stringify(result.body));

    return {
      listingId: listing.id,
      offerId,
      expectedAmount: result.body.checkout.amount,
      listingUpdatedAt: result.body.checkout.listingUpdatedAt,
      requestKey: randomUUID(),
    };
  }

  async function balance(user) {
    return (await request('/wallet', user)).body.balance;
  }

  try {
    await suite.test(
      'top-ups require ownership, confirmation and valid mock amounts',
      async () => {
        const buyer = await createUser();
        const outsider = await createUser();
        assert.equal((await request('/wallet')).status, 401);
        assert.equal((await request('/purchases', null, {})).status, 401);
        assert.equal(await balance(buyer), 0);

        for (const amount of [0, -1, 0.001, 1000000, 'abc']) {
          const invalid = await request('/wallet/top-ups', buyer, {
            amount,
            method: 'FPX',
            requestKey: randomUUID(),
          });
          assert.equal(invalid.status, 400);
        }

        assert.equal(
          (
            await request('/wallet/top-ups', buyer, {
              amount: 10,
              method: 'WALLET',
              requestKey: randomUUID(),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request('/wallet/top-ups', buyer, {
              amount: 10,
              method: 'FPX',
              requestKey: 'short',
            })
          ).status,
          400,
        );

        const payload = { amount: 12.34, method: 'FPX', requestKey: randomUUID() };
        const created = await request('/wallet/top-ups', buyer, payload);
        const route = '/wallet/top-ups/' + created.body.topUp.id;
        assert.equal(created.body.topUp.status, 'PENDING');
        assert.equal(await balance(buyer), 0);
        assert.equal(
          (await request('/wallet/top-ups', buyer, payload)).body.topUp.id,
          created.body.topUp.id,
        );
        assert.equal(
          (await request('/wallet/top-ups', buyer, { ...payload, amount: 20 })).status,
          409,
        );
        assert.equal((await request(route, outsider)).status, 404);
        assert.equal((await request(route + '/confirm', outsider, {})).status, 404);

        const confirmations = await Promise.all([
          request(route + '/confirm', buyer, { amount: 999999 }),
          request(route + '/confirm', buyer, {}),
        ]);
        assert.ok(confirmations.some((result) => result.status === 200));
        assert.ok(confirmations.every((result) => [200, 409].includes(result.status)));
        assert.equal((await request(route + '/confirm', buyer, {})).status, 200);
        assert.equal(await balance(buyer), 12.34);
        assert.equal((await request(route + '/cancel', buyer, {})).status, 409);

        await topUp(buyer, 7.66, 'TNG');
        const wallet = (await request('/wallet', buyer)).body;
        assert.equal(wallet.balance, 20);
        assert.equal(wallet.transactions.length, 2);
        assert.equal(wallet.sellerEarnings, 0);
        assert.ok(
          wallet.transactions.every(
            (entry) => entry.status === 'SUCCESS' && !('requestKey' in entry),
          ),
        );
      },
    );

    await suite.test('cancelled top-ups never credit a wallet', async () => {
      const buyer = await createUser();
      const created = await request('/wallet/top-ups', buyer, {
        amount: 10,
        method: 'TNG',
        requestKey: randomUUID(),
      });
      const route = '/wallet/top-ups/' + created.body.topUp.id;
      assert.equal(
        (await request(route + '/cancel', buyer, {})).body.topUp.status,
        'CANCELLED',
      );
      assert.equal((await request(route + '/cancel', buyer, {})).status, 200);
      assert.equal((await request(route + '/confirm', buyer, {})).status, 409);
      assert.equal(await balance(buyer), 0);
    });

    await suite.test(
      'insufficient funds roll back and successful Buy Now is idempotent',
      async () => {
        const seller = await createUser();
        const buyer = await createUser();
        const outsider = await createUser();
        const listing = await createListing(seller);
        const payload = await checkout(buyer, listing);

        assert.equal((await request('/purchases', buyer, payload)).status, 402);
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listing.id } })).status,
          'ACTIVE',
        );
        assert.equal(
          await prisma.purchase.count({ where: { listingId: listing.id } }),
          0,
        );
        assert.equal(await balance(seller), 0);

        await topUp(buyer, 100);
        const paid = await request('/purchases', buyer, payload);
        assert.equal(paid.status, 201, JSON.stringify(paid.body));
        const repeated = await request('/purchases', buyer, payload);
        assert.equal(repeated.status, 200);
        assert.equal(repeated.body.purchase.id, paid.body.purchase.id);
        assert.equal(
          (await request('/purchases', buyer, { ...payload, requestKey: randomUUID() }))
            .status,
          409,
        );
        assert.equal(
          (await request('/purchases', buyer, { ...payload, expectedAmount: 1 })).status,
          409,
        );
        assert.equal(await balance(buyer), 50);
        assert.equal(await balance(seller), 50);
        assert.equal((await request('/wallet', seller)).body.sellerEarnings, 50);
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listing.id } })).status,
          'SOLD',
        );

        const receiptRoute = '/purchases/' + paid.body.purchase.id;
        assert.equal((await request(receiptRoute, seller)).status, 200);
        assert.equal((await request(receiptRoute, outsider)).status, 404);
        const ledger = await prisma.walletTransaction.findMany({
          where: { purchaseId: paid.body.purchase.id },
        });
        assert.equal(ledger.length, 2);
        assert.deepEqual(ledger.map((entry) => entry.type).sort(), ['PURCHASE', 'SALE']);
        assert.ok(
          ledger.every(
            (entry) =>
              entry.amount === 5000 && entry.reference === paid.body.purchase.reference,
          ),
        );
        for (const user of [buyer, seller]) {
          assert.equal(
            (await prisma.user.findUnique({ where: { id: user.id } }))
              .completedTransactions,
            1,
          );
        }
      },
    );

    await suite.test(
      'self-purchase and stale or forged prices are rejected',
      async () => {
        const seller = await createUser();
        const buyer = await createUser();
        const listing = await createListing(seller);
        const payload = await checkout(buyer, listing);
        assert.equal(
          (await request('/purchases/quote?listingId=' + listing.id, seller)).status,
          403,
        );
        assert.equal(
          (await request('/purchases', buyer, { ...payload, expectedAmount: 0 })).status,
          409,
        );
        await prisma.listing.update({ where: { id: listing.id }, data: { price: 6000 } });
        assert.equal((await request('/purchases', buyer, payload)).status, 409);
        assert.equal(
          await prisma.purchase.count({ where: { listingId: listing.id } }),
          0,
        );
      },
    );

    await suite.test(
      'accepted offers charge the agreed price and complete the negotiation',
      async () => {
        const seller = await createUser();
        const buyer = await createUser();
        const outsider = await createUser();
        const listing = await createListing(seller, 100);
        const offered = await request('/offers', buyer, {
          listingId: listing.id,
          amount: 70,
        });
        const offer = offered.body.offer;
        const accepted = await request('/offers/' + offer.id + '/actions', seller, {
          action: 'accept',
          version: offer.version,
        });
        assert.equal(accepted.status, 200);
        assert.equal(
          (await request('/purchases/quote?listingId=' + listing.id, buyer)).status,
          409,
        );
        assert.equal(
          (
            await request(
              '/purchases/quote?listingId=' + listing.id + '&offerId=' + offer.id,
              outsider,
            )
          ).status,
          403,
        );
        const payload = await checkout(buyer, listing, offer.id);
        assert.equal(payload.expectedAmount, 70);
        await topUp(buyer, 100);
        const paid = await request('/purchases', buyer, payload);
        assert.equal(paid.status, 201);
        assert.equal(await balance(buyer), 30);
        assert.equal(await balance(seller), 70);
        const completed = (await request('/offers/' + offer.id, buyer)).body.offer;
        assert.equal(completed.status, 'COMPLETED');
        assert.equal(completed.purchase.id, paid.body.purchase.id);
        assert.equal(completed.history.at(-1).action, 'COMPLETED');
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listing.id } })).price,
          10000,
        );
        assert.equal((await request('/purchases', buyer, payload)).status, 200);
      },
    );

    await suite.test(
      'competing buyers produce one sale and close open offers',
      async () => {
        const seller = await createUser();
        const buyers = await Promise.all([createUser(), createUser()]);
        const listing = await createListing(seller);
        const offered = await request('/offers', buyers[0], {
          listingId: listing.id,
          amount: 40,
        });
        await topUp(buyers[0], 100);
        await topUp(buyers[1], 100);
        const payloads = await Promise.all(
          buyers.map((buyer) => checkout(buyer, listing)),
        );
        const results = await Promise.all(
          buyers.map((buyer, index) => request('/purchases', buyer, payloads[index])),
        );
        assert.equal(results.filter((result) => result.status === 201).length, 1);
        assert.ok(
          results.every((result) => [201, 409].includes(result.status)),
          JSON.stringify(results),
        );
        assert.equal(
          await prisma.purchase.count({ where: { listingId: listing.id } }),
          1,
        );
        assert.equal(await balance(seller), 50);
        assert.equal((await balance(buyers[0])) + (await balance(buyers[1])), 150);
        const closed = (await request('/offers/' + offered.body.offer.id, buyers[0])).body
          .offer;
        assert.equal(closed.status, 'CLOSED');
        assert.equal(closed.closeReason, 'LISTING_SOLD');
      },
    );

    await suite.test(
      'simultaneous purchases cannot overdraw a shared wallet',
      async () => {
        const seller = await createUser();
        const buyer = await createUser();
        const listings = [
          await createListing(seller, 60),
          await createListing(seller, 60),
        ];
        await topUp(buyer, 100);
        const payloads = await Promise.all(
          listings.map((listing) => checkout(buyer, listing)),
        );
        const results = await Promise.all(
          payloads.map((payload) => request('/purchases', buyer, payload)),
        );
        assert.equal(results.filter((result) => result.status === 201).length, 1);
        assert.ok(
          results.every((result) => [201, 402, 409].includes(result.status)),
          JSON.stringify(results),
        );
        assert.equal(await balance(buyer), 40);
        assert.equal(await balance(seller), 60);
        const losingIndex = results.findIndex((result) => result.status !== 201);
        assert.equal(
          (await request('/purchases', buyer, payloads[losingIndex])).status,
          402,
        );
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listings[losingIndex].id } }))
            .status,
          'ACTIVE',
        );
      },
    );

    await suite.test(
      'concurrent duplicate payment requests debit only once',
      async () => {
        const seller = await createUser();
        const buyer = await createUser();
        const listing = await createListing(seller);
        await topUp(buyer, 100);
        const payload = await checkout(buyer, listing);
        const results = await Promise.all([
          request('/purchases', buyer, payload),
          request('/purchases', buyer, payload),
        ]);
        assert.equal(results.filter((result) => result.status === 201).length, 1);
        assert.ok(results.every((result) => [200, 201, 409].includes(result.status)));
        assert.equal((await request('/purchases', buyer, payload)).status, 200);
        assert.equal(await balance(buyer), 50);
        assert.equal(await balance(seller), 50);
      },
    );

    await suite.test(
      'wallet limits roll back all changes and free listings work',
      async () => {
        const seller = await createUser();
        const buyer = await createUser();
        const listing = await createListing(seller);
        await topUp(buyer, 100);
        await prisma.user.update({
          where: { id: seller.id },
          data: { walletBalance: 2147483647 },
        });
        assert.equal(
          (await request('/purchases', buyer, await checkout(buyer, listing))).status,
          409,
        );
        assert.equal(await balance(buyer), 100);
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listing.id } })).status,
          'ACTIVE',
        );
        assert.equal(
          await prisma.purchase.count({ where: { listingId: listing.id } }),
          0,
        );

        const pending = await request('/wallet/top-ups', seller, {
          amount: 1,
          method: 'FPX',
          requestKey: randomUUID(),
        });
        const route = '/wallet/top-ups/' + pending.body.topUp.id;
        assert.equal((await request(route + '/confirm', seller, {})).status, 409);
        assert.equal((await request(route, seller)).body.topUp.status, 'PENDING');

        const freeBuyer = await createUser();
        const freeListing = await createListing(seller, 0);
        assert.equal(
          (await request('/purchases', freeBuyer, await checkout(freeBuyer, freeListing)))
            .status,
          201,
        );
        assert.equal(await balance(freeBuyer), 0);
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    assert.ok(directory.startsWith(path.join(tmpdir(), 'relive-payments-')));
    await rm(directory, { recursive: true, force: true });
  }
});

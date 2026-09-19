import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('private negotiations and atomic listing reservations', async (suite) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'relive-offers-'));
  const databasePath = path.join(directory, 'offers.db');

  process.env.DATABASE_URL = 'file:' + databasePath.replaceAll('\\', '/');
  process.env.JWT_SECRET = 'isolated-offer-test-secret-at-least-32-characters';

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
  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));

  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';

  async function request(route, method = 'GET', body, cookie) {
    const response = await fetch(baseUrl + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }

  async function register(name) {
    const result = await request('/auth/register', 'POST', {
      name,
      email: name.toLowerCase() + '@offers.test',
      password: 'safe-offer-test-password',
    });

    assert.equal(result.status, 201);

    return { ...result.body.user, cookie: result.cookie };
  }

  let seller;
  let firstBuyer;
  let secondBuyer;
  let outsider;

  async function createListing() {
    const result = await request(
      '/listings',
      'POST',
      {
        title: 'Vintage desk',
        description: 'A sturdy wooden desk in good condition, ready for its next home.',
        price: '550.00',
        category: 'Home & Living',
        condition: 'Good',
        state: 'Selangor',
        city: 'Petaling Jaya',
        images: [],
      },
      seller.cookie,
    );

    assert.equal(result.status, 201);

    return result.body.listing;
  }

  async function createOffer(listing, buyer = firstBuyer, amount = 400) {
    const result = await request(
      '/offers',
      'POST',
      {
        listingId: listing.id,
        amount,
      },
      buyer.cookie,
    );

    assert.equal(result.status, 201, JSON.stringify(result.body));

    return result.body.offer;
  }

  async function act(offer, user, action, amount) {
    return request(
      '/offers/' + offer.id + '/actions',
      'POST',
      {
        action,
        version: offer.version,
        ...(amount === undefined ? {} : { amount }),
      },
      user.cookie,
    );
  }

  try {
    seller = await register('Seller');
    firstBuyer = await register('FirstBuyer');
    secondBuyer = await register('SecondBuyer');
    outsider = await register('Outsider');

    await suite.test('validates amounts and prevents self-negotiation', async () => {
      const listing = await createListing();

      assert.equal((await request('/offers')).status, 401);
      assert.equal(
        (await request('/offers', 'POST', { listingId: listing.id, amount: 400 })).status,
        401,
      );
      assert.equal(
        (
          await request(
            '/offers',
            'POST',
            { listingId: listing.id, amount: 400 },
            seller.cookie,
          )
        ).status,
        403,
      );

      for (const amount of [0, -1, 'abc', 1.234, 1000000, null]) {
        const result = await request(
          '/offers',
          'POST',
          { listingId: listing.id, amount },
          firstBuyer.cookie,
        );
        assert.equal(result.status, 400);
      }

      const result = await request(
        '/offers',
        'POST',
        {
          listingId: listing.id,
          amount: '400.25',
          buyerId: outsider.id,
          sellerId: outsider.id,
          status: 'ACCEPTED',
          agreedPrice: 1,
        },
        firstBuyer.cookie,
      );

      assert.equal(result.status, 201);
      assert.equal(result.body.offer.buyerId, firstBuyer.id);
      assert.equal(result.body.offer.sellerId, seller.id);
      assert.equal(result.body.offer.status, 'PENDING');
      assert.equal(result.body.offer.agreedPrice, null);
      assert.equal(result.body.offer.currentAmount, 400.25);
      assert.equal(result.body.offer.originalPrice, 550);
      assert.equal(result.body.offer.buyer.email, undefined);
      assert.equal(result.body.offer.seller.passwordHash, undefined);

      const duplicate = await request(
        '/offers',
        'POST',
        { listingId: listing.id, amount: 410 },
        firstBuyer.cookie,
      );
      assert.equal(duplicate.status, 409);
    });

    await suite.test('allows only participants to view and act on an offer', async () => {
      const listing = await createListing();
      const offer = await createOffer(listing);

      assert.equal((await request('/offers/' + offer.id)).status, 401);
      assert.equal(
        (await request('/offers/' + offer.id, 'GET', undefined, outsider.cookie)).status,
        403,
      );
      assert.equal((await act(offer, outsider, 'accept')).status, 403);
      assert.equal((await act(offer, firstBuyer, 'accept')).status, 403);
      assert.equal((await act(offer, firstBuyer, 'counter', 420)).status, 403);
      assert.equal((await act(offer, seller, 'cancel')).status, 403);

      const made = await request(
        '/offers?direction=made',
        'GET',
        undefined,
        firstBuyer.cookie,
      );
      const received = await request(
        '/offers?direction=received',
        'GET',
        undefined,
        seller.cookie,
      );
      const unrelated = await request(
        '/offers?direction=received',
        'GET',
        undefined,
        outsider.cookie,
      );

      assert.ok(made.body.offers.some((entry) => entry.id === offer.id));
      assert.ok(received.body.offers.some((entry) => entry.id === offer.id));
      assert.equal(unrelated.body.offers.length, 0);
      assert.equal(
        (await request('/offers?direction=invalid', 'GET', undefined, seller.cookie))
          .status,
        400,
      );
      assert.deepEqual(offer.allowedActions, ['cancel']);

      const sellerView = await request(
        '/offers/' + offer.id,
        'GET',
        undefined,
        seller.cookie,
      );
      assert.deepEqual(sellerView.body.offer.allowedActions, [
        'accept',
        'reject',
        'counter',
      ]);
    });

    await suite.test(
      'keeps a negotiation timeline and closes competing offers on acceptance',
      async () => {
        const listing = await createListing();
        const initialOffer = await createOffer(listing);
        const competingOffer = await createOffer(listing, secondBuyer, 420);

        await request('/favourites/' + listing.id, 'PUT', undefined, firstBuyer.cookie);

        const sellerCounter = await act(initialOffer, seller, 'counter', 450);
        assert.equal(sellerCounter.status, 200);
        assert.equal(sellerCounter.body.offer.nextActorId, firstBuyer.id);

        const staleResponse = await act(initialOffer, seller, 'counter', 440);
        assert.equal(staleResponse.status, 409);

        const buyerCounter = await act(
          sellerCounter.body.offer,
          firstBuyer,
          'counter',
          430,
        );
        assert.equal(buyerCounter.status, 200);
        assert.equal(buyerCounter.body.offer.nextActorId, seller.id);

        const accepted = await act(buyerCounter.body.offer, seller, 'accept');
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.offer.status, 'ACCEPTED');
        assert.equal(accepted.body.offer.agreedPrice, 430);
        assert.equal(accepted.body.offer.currentAmount, 430);
        assert.equal(accepted.body.offer.nextActorId, null);
        assert.deepEqual(accepted.body.offer.allowedActions, []);
        assert.deepEqual(
          accepted.body.offer.history.map(({ action, amount }) => [action, amount]),
          [
            ['OFFERED', 400],
            ['COUNTERED', 450],
            ['OFFERED', 430],
            ['ACCEPTED', 430],
          ],
        );

        const storedListing = await prisma.listing.findUnique({
          where: { id: listing.id },
        });
        assert.equal(storedListing.status, 'RESERVED');
        assert.equal(storedListing.price, 55000);
        assert.equal(accepted.body.offer.originalPrice, 550);

        const closed = await request(
          '/offers/' + competingOffer.id,
          'GET',
          undefined,
          secondBuyer.cookie,
        );
        assert.equal(closed.body.offer.status, 'CLOSED');
        assert.equal(closed.body.offer.closeReason, 'ANOTHER_OFFER_ACCEPTED');
        assert.equal(closed.body.offer.history.at(-1).action, 'CLOSED');
        assert.equal((await act(closed.body.offer, seller, 'accept')).status, 409);
        assert.equal((await act(accepted.body.offer, firstBuyer, 'cancel')).status, 409);

        const marketplace = await request('/listings');
        assert.equal(
          marketplace.body.listings.some((entry) => entry.id === listing.id),
          false,
        );

        const favourites = await request(
          '/favourites',
          'GET',
          undefined,
          firstBuyer.cookie,
        );
        assert.equal(
          favourites.body.listings.some((entry) => entry.id === listing.id),
          false,
        );
        assert.equal(
          (
            await request(
              '/favourites/' + listing.id,
              'PUT',
              undefined,
              secondBuyer.cookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              '/listings/' + listing.id + '/withdraw',
              'POST',
              undefined,
              seller.cookie,
            )
          ).status,
          409,
        );
      },
    );

    await suite.test('lets the buyer accept a seller counteroffer', async () => {
      const listing = await createListing();
      const offer = await createOffer(listing);
      const otherOffer = await createOffer(listing, secondBuyer);
      const countered = await act(offer, seller, 'counter', 450);

      const accepted = await act(countered.body.offer, firstBuyer, 'accept');
      assert.equal(accepted.status, 200);
      assert.equal(accepted.body.offer.agreedPrice, 450);
      assert.equal(accepted.body.offer.history.at(-1).userId, firstBuyer.id);
      assert.equal(
        (await prisma.offer.findUnique({ where: { id: otherOffer.id } })).status,
        'CLOSED',
      );
      assert.equal(
        (await prisma.listing.findUnique({ where: { id: listing.id } })).price,
        55000,
      );
    });

    await suite.test(
      'handles rejection, cancellation and invalid counters without changing history',
      async () => {
        const listing = await createListing();
        const offer = await createOffer(listing);

        for (const amount of [0, -1, 400, 400.555]) {
          assert.equal((await act(offer, seller, 'counter', amount)).status, 400);
        }

        assert.equal(
          await prisma.offerHistory.count({ where: { offerId: offer.id } }),
          1,
        );
        assert.equal((await act(offer, seller, 'complete')).status, 400);

        const rejected = await act(offer, seller, 'reject');
        assert.equal(rejected.body.offer.status, 'REJECTED');
        assert.equal(
          (await act(rejected.body.offer, firstBuyer, 'counter', 430)).status,
          409,
        );

        const replacement = await createOffer(listing);
        const countered = await act(replacement, seller, 'counter', 460);
        const buyerRejection = await act(countered.body.offer, firstBuyer, 'reject');
        assert.equal(buyerRejection.body.offer.status, 'REJECTED');

        const nextOffer = await createOffer(listing);
        const cancelled = await act(nextOffer, firstBuyer, 'cancel');
        assert.equal(cancelled.body.offer.status, 'CANCELLED');
        assert.equal(cancelled.body.offer.history.at(-1).action, 'CANCELLED');
        assert.equal((await act(cancelled.body.offer, seller, 'accept')).status, 409);
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listing.id } })).status,
          'ACTIVE',
        );
      },
    );

    await suite.test(
      'closes negotiations when the seller withdraws the listing',
      async () => {
        const listing = await createListing();
        const offer = await createOffer(listing);
        const otherOffer = await createOffer(listing, secondBuyer);

        const withdrawn = await request(
          '/listings/' + listing.id + '/withdraw',
          'POST',
          undefined,
          seller.cookie,
        );
        assert.equal(withdrawn.status, 200);

        for (const pendingOffer of [offer, otherOffer]) {
          const saved = await prisma.offer.findUnique({
            where: { id: pendingOffer.id },
            include: { history: { orderBy: { id: 'asc' } } },
          });

          assert.equal(saved.status, 'CLOSED');
          assert.equal(saved.closeReason, 'LISTING_WITHDRAWN');
          assert.equal(saved.history.at(-1).action, 'CLOSED');
        }

        const newOffer = await request(
          '/offers',
          'POST',
          { listingId: listing.id, amount: 450 },
          outsider.cookie,
        );
        assert.equal(newOffer.status, 409);
      },
    );

    await suite.test(
      'keeps the original price snapshot when the asking price changes',
      async () => {
        const listing = await createListing();
        const offer = await createOffer(listing);

        await prisma.listing.update({
          where: { id: listing.id },
          data: { price: 60000 },
        });

        const accepted = await act(offer, seller, 'accept');
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.offer.originalPrice, 550);
        assert.equal(accepted.body.offer.agreedPrice, 400);
        assert.equal(accepted.body.offer.listing.price, 600);

        await prisma.offer.update({
          where: { id: offer.id },
          data: { status: 'COMPLETED' },
        });
        const completed = await request(
          '/offers/' + offer.id,
          'GET',
          undefined,
          firstBuyer.cookie,
        );
        assert.deepEqual(completed.body.offer.allowedActions, []);
        assert.equal(
          (await act(completed.body.offer, seller, 'counter', 420)).status,
          409,
        );
      },
    );

    await suite.test(
      'allows only one winner when two offers are accepted concurrently',
      async () => {
        const listing = await createListing();
        const first = await createOffer(listing);
        const second = await createOffer(listing, secondBuyer, 430);

        const responses = await Promise.all([
          act(first, seller, 'accept'),
          act(second, seller, 'accept'),
        ]);

        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);

        const savedOffers = await prisma.offer.findMany({
          where: { listingId: listing.id },
        });
        assert.equal(
          savedOffers.filter((offer) => offer.status === 'ACCEPTED').length,
          1,
        );
        assert.equal(savedOffers.filter((offer) => offer.status === 'CLOSED').length, 1);
        assert.equal(
          await prisma.offerHistory.count({
            where: { offerId: { in: [first.id, second.id] }, action: 'ACCEPTED' },
          }),
          1,
        );
        assert.equal(
          (await prisma.listing.findUnique({ where: { id: listing.id } })).status,
          'RESERVED',
        );
      },
    );

    await suite.test(
      'rejects concurrent duplicate open offers from one buyer',
      async () => {
        const listing = await createListing();
        const body = { listingId: listing.id, amount: 400 };

        const responses = await Promise.all([
          request('/offers', 'POST', body, firstBuyer.cookie),
          request('/offers', 'POST', body, firstBuyer.cookie),
        ]);

        assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
        assert.equal(
          await prisma.offer.count({
            where: { listingId: listing.id, buyerId: firstBuyer.id },
          }),
          1,
        );
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();

    assert.ok(directory.startsWith(path.join(tmpdir(), 'relive-offers-')));
    await rm(directory, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
test('marketplace CRUD, owner boundaries, images, filters, states and favourites', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'relive-listings-'));
  const database = path.join(directory, 'test.db');
  process.env.DATABASE_URL = 'file:' + database.replaceAll('\\', '/');
  process.env.JWT_SECRET = 'isolated-listing-test-secret-at-least-32-characters';
  const sqlite = new DatabaseSync(database);
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const entry of (await readdir(migrations)).sort())
    if (entry !== 'migration_lock.toml')
      sqlite.exec(await readFile(new URL(entry + '/migration.sql', migrations), 'utf8'));
  sqlite.close();
  const { config } = await import('../src/config.js');
  config.uploadsDir = path.join(directory, 'uploads');
  const { app } = await import('../src/app.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, method = 'GET', body, cookie) {
    const response = await fetch(base + '/api' + route, {
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
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const values = {
    title: 'Oak bedside table',
    description: 'A sturdy little bedside table with a few small marks.',
    price: '125.50',
    category: 'Home & Living',
    condition: 'Good',
    state: 'Selangor',
    city: 'Petaling Jaya',
    images: [png],
  };
  try {
    const seller = await request('/auth/register', 'POST', {
      name: 'Seller',
      email: 'seller@listing.test',
      password: 'listing-test-password',
    });
    const buyer = await request('/auth/register', 'POST', {
      name: 'Buyer',
      email: 'buyer@listing.test',
      password: 'listing-test-password',
    });
    assert.equal(seller.status, 201);
    assert.equal(buyer.status, 201);
    assert.equal((await request('/listings', 'POST', values)).status, 401);
    assert.equal((await request('/listings/mine')).status, 401);
    assert.equal(
      (
        await request(
          '/listings',
          'POST',
          { ...values, sellerId: buyer.body.user.id },
          seller.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/listings', 'POST', { ...values, status: 'SOLD' }, seller.cookie))
        .status,
      400,
    );
    for (const invalid of [
      { price: -1 },
      { price: '1.123' },
      { price: 'NaN' },
      { category: 'Invalid' },
      { condition: 'New' },
      { state: 'Invalid' },
      { city: '' },
      { description: 'short' },
      { images: Array(6).fill(png) },
      { images: ['data:image/svg+xml;base64,PHN2Zz4='] },
      {
        images: [
          'data:image/png;base64,' +
            Buffer.from('not really a png file').toString('base64'),
        ],
      },
    ]) {
      assert.equal(
        (await request('/listings', 'POST', { ...values, ...invalid }, seller.cookie))
          .status,
        400,
        JSON.stringify(invalid).slice(0, 100),
      );
    }
    const oversized =
      'data:image/png;base64,' +
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        Buffer.alloc(2 * 1024 * 1024),
      ]).toString('base64');
    assert.equal(
      (
        await request(
          '/listings',
          'POST',
          { ...values, images: [oversized] },
          seller.cookie,
        )
      ).status,
      400,
    );
    assert.equal(await prisma.listing.count(), 0);
    const created = await request(
      '/listings',
      'POST',
      { ...values, images: Array(5).fill(png) },
      seller.cookie,
    );
    assert.equal(created.status, 201);
    const listing = created.body.listing;
    const id = listing.id;
    assert.equal(listing.sellerId, seller.body.user.id);
    assert.equal(listing.status, 'ACTIVE');
    assert.equal(listing.price, 125.5);
    assert.equal(listing.images.length, 5);
    assert.equal(listing.seller.email, undefined);
    assert.equal(listing.seller.passwordHash, undefined);
    assert.equal((await prisma.listing.findUnique({ where: { id } })).price, 12550);
    const photoResponse = await fetch(base + listing.images[0].url);
    assert.equal(photoResponse.status, 200);
    assert.match(photoResponse.headers.get('content-type'), /image\/png/);
    assert.equal((await request('/listings/' + id)).status, 200);
    assert.equal(
      (await request('/listings/mine', 'GET', undefined, buyer.cookie)).body.listings
        .length,
      0,
    );
    assert.equal(
      (await request('/listings/mine', 'GET', undefined, seller.cookie)).body.listings
        .length,
      1,
    );
    const update = {
      ...values,
      title: 'Updated oak table',
      images: [listing.images[0].url, png],
      updatedAt: listing.updatedAt,
    };
    assert.equal(
      (await request('/listings/' + id, 'PATCH', update, buyer.cookie)).status,
      403,
    );
    assert.equal(
      (await request('/listings/' + id + '/withdraw', 'POST', undefined, buyer.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          '/listings/' + id,
          'PATCH',
          { ...update, images: ['/uploads/someone-else.png'] },
          seller.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/favourites/' + id, 'PUT', undefined, seller.cookie)).status,
      403,
    );
    assert.equal(
      (await request('/favourites/' + id, 'PUT', undefined, buyer.cookie)).status,
      200,
    );
    assert.equal(
      (await request('/favourites/' + id, 'PUT', undefined, buyer.cookie)).status,
      200,
    );
    assert.equal(await prisma.favourite.count(), 1);
    assert.equal(
      (await request('/favourites', 'GET', undefined, buyer.cookie)).body.listings.length,
      1,
    );
    assert.equal(
      (await request('/favourites/' + id, 'GET', undefined, buyer.cookie)).body.favourite,
      true,
    );
    const edited = await request('/listings/' + id, 'PATCH', update, seller.cookie);
    assert.equal(edited.status, 200);
    assert.equal(edited.body.listing.images.length, 2);
    assert.equal((await readdir(config.uploadsDir)).length, 2);
    assert.equal(
      (await request('/listings/' + id, 'PATCH', update, seller.cookie)).status,
      409,
    );
    const cheap = await request(
      '/listings',
      'POST',
      {
        ...values,
        title: 'Budget headphones',
        price: '20',
        category: 'Electronics',
        condition: 'Like New',
        state: 'Johor',
        city: 'Johor Bahru',
        images: [],
      },
      buyer.cookie,
    );
    assert.equal(cheap.status, 201, 'A buyer may also sell');
    const expensive = await request(
      '/listings',
      'POST',
      { ...values, title: 'Premium table', price: '250', images: [] },
      seller.cookie,
    );
    assert.equal(expensive.status, 201);
    const all = await request('/listings');
    assert.equal(all.body.total, 3);
    assert.equal(all.body.listings[0].id, expensive.body.listing.id);
    assert.deepEqual(
      (await request('/listings?sort=price_asc')).body.listings.map((item) => item.price),
      [20, 125.5, 250],
    );
    assert.deepEqual(
      (await request('/listings?sort=price_desc')).body.listings.map(
        (item) => item.price,
      ),
      [250, 125.5, 20],
    );
    const filtered = await request(
      '/listings?search=oak&category=Home%20%26%20Living&condition=Good&state=Selangor&city=petaling&minPrice=100&maxPrice=150',
    );
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.listings[0].id, id);
    assert.equal((await request('/listings?category=Electronics')).body.total, 1);
    assert.equal((await request('/listings?search=does-not-exist')).body.total, 0);
    for (const query of [
      'minPrice=50&maxPrice=10',
      'minPrice=-1',
      'sort=invalid',
      'page=0',
      'condition=New',
      'state=Unknown',
    ])
      assert.equal((await request('/listings?' + query)).status, 400);
    for (const status of [
      'RESERVED',
      'SOLD',
      'WITHDRAWN',
      'UNDER_REVIEW',
      'NEEDS_REVISION',
      'REMOVED',
    ]) {
      await prisma.listing.update({ where: { id }, data: { status } });
      assert.equal(
        (await request('/listings')).body.listings.some((item) => item.id === id),
        false,
      );
      assert.equal(
        (await request('/listings/' + id, 'GET', undefined, buyer.cookie)).status,
        404,
      );
      assert.equal(
        (await request('/listings/' + id, 'GET', undefined, seller.cookie)).status,
        200,
      );
      assert.equal(
        (await request('/favourites/' + id, 'PUT', undefined, buyer.cookie)).status,
        404,
      );
      if (status !== 'NEEDS_REVISION')
        assert.equal(
          (await request('/listings/' + id, 'PATCH', update, seller.cookie)).status,
          409,
        );
    }
    const revision = await prisma.listing.update({
      where: { id },
      data: { status: 'NEEDS_REVISION' },
    });
    const resubmit = await request(
      '/listings/' + id,
      'PATCH',
      { ...values, images: [], updatedAt: revision.updatedAt.toISOString() },
      seller.cookie,
    );
    assert.equal(resubmit.status, 200);
    assert.equal(resubmit.body.listing.status, 'UNDER_REVIEW');
    assert.equal(
      (await request('/listings/' + id + '/withdraw', 'POST', undefined, seller.cookie))
        .status,
      200,
    );
    assert.equal(
      (await prisma.listing.findUnique({ where: { id } })).status,
      'WITHDRAWN',
    );
    assert.equal(
      (await request('/favourites', 'GET', undefined, buyer.cookie)).body.listings.length,
      0,
    );
    assert.equal(
      (await request('/favourites/' + id, 'DELETE', undefined, buyer.cookie)).status,
      200,
    );
    assert.equal(await prisma.favourite.count(), 0);
    await prisma.listing.update({ where: { id }, data: { status: 'SOLD' } });
    assert.equal(
      (await request('/listings/' + id + '/withdraw', 'POST', undefined, seller.cookie))
        .status,
      409,
    );
    assert.equal((await request('/listings/missing')).status, 404);
    assert.equal(
      (await request('/listings/mine', 'GET', undefined, seller.cookie)).body.listings
        .length,
      2,
    );
    await prisma.listing.createMany({
      data: Array.from({ length: 13 }, (_, i) => ({
        sellerId: seller.body.user.id,
        title: 'Pagination ' + i,
        description: values.description,
        price: 100,
        category: values.category,
        condition: values.condition,
        state: values.state,
        city: values.city,
      })),
    });
    const page1 = await request('/listings');
    const page2 = await request('/listings?page=2');
    assert.equal(page1.body.listings.length, 12);
    assert.equal(page1.body.total, 15);
    assert.equal(page2.body.listings.length, 3);
    assert.equal(
      page1.body.listings.some((a) => page2.body.listings.some((b) => a.id === b.id)),
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    assert.ok(directory.startsWith(path.join(tmpdir(), 'relive-listings-')));
    await rm(directory, { recursive: true, force: true });
  }
});

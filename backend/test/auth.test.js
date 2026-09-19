import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('authentication, profile, uploads, and fixed administrator lifecycle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'relive-auth-'));
  const database = path.join(directory, 'test.db');
  process.env.DATABASE_URL = 'file:' + database.replaceAll('\\', '/');
  process.env.JWT_SECRET = 'isolated-test-secret-at-least-32-characters';
  process.env.ADMIN_EMAIL = 'admin@test.local';
  process.env.ADMIN_PASSWORD = 'test-admin-password-strong';
  // An empty value prevents dotenv from loading the real local admin hash.
  process.env.ADMIN_PASSWORD_HASH = '';
  const sqlite = new DatabaseSync(database);
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const entry of (await readdir(migrations)).sort())
    if (entry !== 'migration_lock.toml')
      sqlite.exec(await readFile(new URL(entry + '/migration.sql', migrations), 'utf8'));
  sqlite.close();
  const { app } = await import('../src/app.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const { config } = await import('../src/config.js');
  config.uploadsDir = path.join(directory, 'uploads');
  const { seedAdmin } = await import('../prisma/seed.js');
  const { signToken } = await import('../src/lib/jwt.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  async function request(route, method = 'GET', body, cookie, headers = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie'),
    };
  }
  const account = {
    name: 'Amina Noor',
    email: 'AMINA@example.com',
    password: 'a-long-test-password',
  };
  try {
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/profile', 'PATCH', {})).status, 401);
    assert.equal(
      (await request('/auth/register', 'POST', { ...account, password: 'short' })).status,
      400,
    );
    assert.equal(
      (await request('/auth/register', 'POST', { ...account, role: 'ADMIN' })).status,
      400,
    );
    assert.equal(
      (
        await request('/auth/register', 'POST', {
          ...account,
          email: process.env.ADMIN_EMAIL,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/auth/register', 'POST', account, null, {
          Origin: 'https://untrusted.example',
        })
      ).status,
      403,
    );
    const registration = await request('/auth/register', 'POST', account);
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.email, 'amina@example.com');
    assert.equal(registration.body.user.role, 'USER');
    assert.equal(registration.body.user.passwordHash, undefined);
    assert.match(registration.cookie, /HttpOnly/);
    assert.match(registration.cookie, /SameSite=Strict/);
    const cookie = registration.cookie.split(';')[0];
    const stored = await prisma.user.findUnique({
      where: { id: registration.body.user.id },
    });
    assert.notEqual(stored.passwordHash, account.password);
    assert.match(stored.passwordHash, /^scrypt\$/);
    assert.equal((await request('/auth/register', 'POST', account)).status, 409);
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 200);
    assert.equal((await request('/auth/admin', 'GET', undefined, cookie)).status, 403);
    assert.equal(
      (
        await request('/auth/login', 'POST', {
          email: account.email,
          password: 'wrong-password-long',
        })
      ).status,
      401,
    );
    assert.equal(
      (await request('/auth/forgot-password', 'POST', { email: 'missing@example.com' }))
        .status,
      200,
    );
    const profile = {
      name: 'Amina Updated',
      email: 'amina@example.com',
      phone: '+60 12 345 6789',
      state: 'Selangor',
      city: 'Petaling Jaya',
      role: 'ADMIN',
      averageRating: 5,
      completedTransactions: 100,
      passwordHash: 'bad',
    };
    assert.equal(
      (await request('/profile', 'PATCH', { ...profile, state: 'Invalid' }, cookie))
        .status,
      400,
    );
    assert.equal(
      (await request('/profile', 'PATCH', { ...profile, city: '' }, cookie)).status,
      400,
    );
    const update = await request('/profile', 'PATCH', profile, cookie);
    assert.equal(update.status, 200);
    assert.equal(update.body.user.city, 'Petaling Jaya');
    assert.equal(update.body.user.role, 'USER');
    assert.equal(update.body.user.averageRating, 0);
    assert.equal(update.body.user.completedTransactions, 0);
    assert.equal(
      (
        await request(
          '/profile/image',
          'PUT',
          { image: 'data:image/svg+xml;base64,PHN2Zz4=' },
          cookie,
        )
      ).status,
      400,
    );
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const image = await request('/profile/image', 'PUT', { image: png }, cookie);
    assert.equal(image.status, 200);
    assert.match(image.body.user.profileImage, /^\/uploads\/[a-f0-9-]+\.png$/);
    assert.equal((await readdir(config.uploadsDir)).length, 1);
    const logout = await request('/auth/logout', 'POST', undefined, cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 401);
    const login = await request('/auth/login', 'POST', account);
    assert.equal(login.status, 200);
    const newCookie = login.cookie.split(';')[0];
    process.env.JWT_EXPIRES_IN = '-1s';
    const expired = signToken(stored.id, 1);
    process.env.JWT_EXPIRES_IN = '7d';
    assert.equal(
      (
        await request('/auth/me', 'GET', undefined, undefined, {
          Authorization: 'Bearer ' + expired,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request('/auth/me', 'GET', undefined, undefined, {
          Authorization: 'Bearer broken',
        })
      ).status,
      401,
    );
    assert.equal(
      (await request('/auth/me', 'GET', undefined, newCookie)).body.user.name,
      'Amina Updated',
    );
    await seedAdmin();
    await seedAdmin();
    assert.equal(await prisma.user.count({ where: { role: 'ADMIN' } }), 1);
    const admin = await request('/auth/login', 'POST', {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.user.role, 'ADMIN');
    const adminCookie = admin.cookie.split(';')[0];
    assert.equal(
      (await request('/auth/admin', 'GET', undefined, adminCookie)).status,
      200,
    );
    assert.equal(
      (
        await request(
          '/profile',
          'PATCH',
          { name: 'Admin', email: 'changed@example.com' },
          adminCookie,
        )
      ).status,
      400,
    );
    await seedAdmin();
    assert.equal((await request('/auth/me', 'GET', undefined, adminCookie)).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    // This directory is exclusively created for this test.
    assert.ok(directory.startsWith(path.join(tmpdir(), 'relive-auth-')));
    await rm(directory, { recursive: true, force: true });
  }
});

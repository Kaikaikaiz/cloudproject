import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { signToken, verifyToken } from '../src/lib/jwt.js';

test('API foundation exposes health, CORS, and JSON 404s', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const origin of [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ]) {
      const health = await fetch(base + '/api/health', { headers: { Origin: origin } });
      assert.equal(health.status, 200);
      assert.equal(health.headers.get('access-control-allow-origin'), origin);
      assert.equal(health.headers.get('access-control-allow-credentials'), 'true');
      assert.deepEqual(await health.json(), {
        status: 'ok', service: 'relive-api', stage: 'foundation',
      });
    }
    const missing = await fetch(base + '/api/not-a-real-route');
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Route not found.' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('JWT helpers require a real secret and reject tampering', () => {
  const previous = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => signToken('sample-user'), /JWT_SECRET/);
    process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-characters';
    const token = signToken('sample-user');
    assert.equal(verifyToken(token).sub, 'sample-user');
    assert.throws(() => verifyToken(token + 'tampered'));
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

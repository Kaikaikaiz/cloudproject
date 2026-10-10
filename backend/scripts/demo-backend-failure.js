import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServiceApp } from '../src/cloud/service-app.js';
import { register } from '../src/cloud/routes/listings.js';

// Local evidence demonstration only. No AWS clients or credentials are used.
let simulateFailure = true;
const store = {
  async listings() {
    if (simulateFailure) {
      const error = new Error('Deliberately simulated database failure');
      error.name = 'SimulatedDatabaseFailure';
      throw error;
    }
    return [];
  },
};
const app = createServiceApp({
  registrars: { listings: register },
  store,
  images: {},
  origins: [],
});
const server = app.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/listings`;
  console.log('LOCAL SIMULATION — real Listings route and error middleware; fake database.');
  console.log('No AWS resources are accessed or modified.');
  console.log('\n1. Simulate database failure: GET /api/listings');
  let response = await fetch(url);
  let body = await response.json();
  console.log(`HTTP ${response.status}`, JSON.stringify(body));
  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: 'Something went wrong.' });

  console.log('\n2. Restore fake database dependency and repeat GET /api/listings');
  simulateFailure = false;
  response = await fetch(url);
  body = await response.json();
  console.log(`HTTP ${response.status}`, JSON.stringify(body));
  assert.equal(response.status, 200);
  assert.deepEqual(body, { listings: [], total: 0, page: 1, pages: 0 });
  console.log('\nPASS — generic 500 response verified, then successful recovery to 200.');
  console.log('Logs above are local terminal logs, not CloudWatch execution evidence.');
} finally {
  if (server.listening) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

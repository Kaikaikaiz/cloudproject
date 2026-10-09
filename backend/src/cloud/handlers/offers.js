import { createServiceApp } from '../service-app.js';
import { register } from '../routes/offers.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(
  createServiceApp({ registrars: { offers: register } }),
);

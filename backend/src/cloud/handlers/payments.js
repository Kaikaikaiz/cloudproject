import { createServiceApp } from '../service-app.js';
import { register } from '../routes/payments.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(
  createServiceApp({ registrars: { payments: register } }),
);

import { createServiceApp } from '../service-app.js';
import { register } from '../routes/dashboard.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(
  createServiceApp({ registrars: { dashboard: register } }),
);

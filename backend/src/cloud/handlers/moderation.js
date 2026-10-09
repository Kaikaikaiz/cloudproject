import { createServiceApp } from '../service-app.js';
import { register } from '../routes/moderation.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(
  createServiceApp({ registrars: { moderation: register } }),
);

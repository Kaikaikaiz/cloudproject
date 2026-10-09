import { createServiceApp } from '../service-app.js';
import { register } from '../routes/auth.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(createServiceApp({ registrars: { auth: register } }));

import { createServiceApp } from '../service-app.js';
import { register } from '../routes/users.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(createServiceApp({ registrars: { users: register } }));

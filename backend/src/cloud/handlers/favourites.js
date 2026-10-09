import { createServiceApp } from '../service-app.js';
import { register } from '../routes/favourites.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(createServiceApp({ registrars: { favourites: register } }));

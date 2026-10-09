import { createServiceApp } from '../service-app.js';
import { register } from '../routes/images.js';
import { createHandler } from '../handler.js';
export const handler = createHandler(createServiceApp({ registrars: { images: register } }));

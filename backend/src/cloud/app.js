import { register as moderation } from './routes/moderation.js';
import { createServiceApp } from './service-app.js';
import { register as auth } from './routes/auth.js';
import { register as users } from './routes/users.js';
import { register as imagesRoutes } from './routes/images.js';
import { register as listings } from './routes/listings.js';
import { register as favourites } from './routes/favourites.js';
import { register as offers } from './routes/offers.js';
import { register as payments } from './routes/payments.js';
import { register as dashboard } from './routes/dashboard.js';
const registrars = { moderation, auth, users, images: imagesRoutes, listings, favourites, offers, payments, dashboard };
export function createCloudApp(options = {}) { return createServiceApp({ ...options, registrars }); }

import { createServiceApp } from './service-app.js';
import { register as auth } from './routes/auth.js';
import { register as users } from './routes/users.js';
import { register as imagesRoutes } from './routes/images.js';
import { register as listings } from './routes/listings.js';
import { register as favourites } from './routes/favourites.js';
const registrars = { auth, users, images: imagesRoutes, listings, favourites };
export function createCloudApp(options = {}) { return createServiceApp({ ...options, registrars }); }

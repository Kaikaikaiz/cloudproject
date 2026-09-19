import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import listingRoutes from './routes/listings.js';
import favouriteRoutes from './routes/favourites.js';
import offerRoutes from './routes/offers.js';
export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use((req, res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== config.frontendUrl
  )
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  next();
});
app.use('/api/listings', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(
  '/uploads',
  express.static(config.uploadsDir, { dotfiles: 'deny', index: false }),
);
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', service: 'relive-api', stage: 'foundation' }),
);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/favourites', favouriteRoutes);
app.use('/api/offers', offerRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, _req, res, _next) => {
  if (error.code === 'P2002')
    return res.status(409).json({ error: 'This email is already in use.' });
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error(error);
  res.status(status).json({
    error:
      status === 500
        ? 'Something went wrong.'
        : status === 413
          ? 'Image or request is too large.'
          : error.message,
  });
});

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import listingRoutes from './routes/listings.js';
import favouriteRoutes from './routes/favourites.js';
import offerRoutes from './routes/offers.js';
import walletRoutes from './routes/wallet.js';
import purchaseRoutes from './routes/purchases.js';
import transactionRoutes from './routes/transactions.js';
import userRoutes from './routes/users.js';
import reportRoutes from './routes/reports.js';
import moderationRoutes from './routes/moderation.js';
import dashboardRoutes from './routes/dashboard.js';
export const app = express();
app.disable('x-powered-by');
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Requests without Origin include same-origin calls and command-line health checks.
      callback(null, !origin || config.allowedOrigins.includes(origin));
    },
  }),
);
app.use((req, res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers.origin &&
    !config.allowedOrigins.includes(req.headers.origin)
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
app.use('/api/wallet', walletRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin/reports', moderationRoutes);
app.use('/api/dashboard', dashboardRoutes);
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

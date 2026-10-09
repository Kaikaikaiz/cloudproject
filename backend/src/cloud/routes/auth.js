import { randomUUID } from 'node:crypto';
import { hashPassword, checkPassword } from '../../lib/password.js';
import { signToken } from '../../lib/jwt.js';
import { fail, profileValues, emailValue, passwordValue } from '../../lib/validation.js';
import { listingValues, listingQuery, editableStatuses, withdrawableStatuses } from '../../lib/listings.js';
export function register(app, { store, images, safe, auth, member, serialize, owned }) {
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'relive-api', storage: 'dynamodb', stage: 'commerce', features: ['auth', 'profile', 'listings', 'images', 'favourites', 'offers', 'wallet', 'purchases', 'transactions', 'reviews', 'dashboard'] }));
  app.post('/api/auth/register', async (req, res) => {
    const body = req.body || {};
    const values = profileValues(body);
    const password = passwordValue(body.password);
    if ('role' in body || 'id' in body) fail('Account roles cannot be selected during registration.');
    if (values.email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) fail('This email is reserved.', 409);
    // Validate signing configuration before committing an account.
    signToken('configuration-check');
    const user = { ...values, id: randomUUID(), passwordHash: await hashPassword(password), role: 'USER', tokenVersion: 0, version: 0,
      createdAt: new Date().toISOString(), profileImage: null, averageRating: 0, totalReviews: 0, completedTransactions: 0, walletBalance: 0 };
    await store.register(user);
    res.status(201).json({ user: await safe(user), token: signToken(user.id, user.tokenVersion) });
  });
  app.post('/api/auth/login', async (req, res) => {
    const user = await store.userByEmail(emailValue(req.body?.email));
    const password = passwordValue(req.body?.password);
    const hash = user?.passwordHash || await hashPassword('not-a-real-account-password');
    if (!await checkPassword(password, hash) || !user) fail('Email or password is incorrect.', 401);
    res.json({ user: await safe(user), token: signToken(user.id, user.tokenVersion) });
  });
  app.get('/api/auth/me', auth, async (req, res) => res.json({ user: await safe(req.user) }));
  app.post('/api/auth/logout', auth, async (req, res) => { await store.logout(req.user.id); res.json({ message: 'You have been logged out.' }); });
  app.post('/api/auth/forgot-password', (_req, res) => res.status(501).json({ error: 'Password recovery is not available in this deployment yet.' }));
}

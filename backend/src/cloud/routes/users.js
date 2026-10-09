import { randomUUID } from 'node:crypto';
import { hashPassword, checkPassword } from '../../lib/password.js';
import { signToken } from '../../lib/jwt.js';
import { fail, profileValues, emailValue, passwordValue } from '../../lib/validation.js';
import { listingValues, listingQuery, editableStatuses, withdrawableStatuses } from '../../lib/listings.js';
export function register(app, { store, images, safe, auth, member, serialize, owned }) {
  app.patch('/api/profile', auth, async (req, res) => {
    const values = profileValues(req.body || {});
    if ((req.user.role === 'ADMIN' && values.email !== req.user.email) || (req.user.role !== 'ADMIN' && values.email === process.env.ADMIN_EMAIL?.trim().toLowerCase())) fail('This email is reserved.', 409);
    const next = { ...req.user, ...values, version: req.user.version + 1 };
    await store.saveUser(req.user, next);
    res.json({ user: await safe(next) });
  });
  app.put('/api/profile/image', auth, async (req, res) => {
    const [image] = await images.finalize(req.user.id, [req.body?.image], [], 700 * 1024);
    const next = { ...req.user, profileImage: image, version: req.user.version + 1 };
    await store.saveUser(req.user, next);
    res.json({ user: await safe(next) });
  });
  app.get('/api/users/:id', async (req, res) => {
    const user = await store.user(req.params.id);
    if (!user) fail('User not found.', 404);
    const records = await store.commerce.records(user.id, 'REVIEW');
    const reviews = await Promise.all(records.map(async ({ id, rating, comment, createdAt, reviewerId }) => {
      const reviewer = await store.user(reviewerId);
      return { id, rating, comment, createdAt, reviewer: { id: reviewerId, name: reviewer?.name || 'Unavailable user' } };
    }));
    res.json({ user: await safe(user, true), reviews });
  });
}

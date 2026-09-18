import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { hashPassword, checkPassword } from '../lib/password.js';
import { emailValue, passwordValue, profileValues, publicUser, fail } from '../lib/validation.js';
import { createSession, clearSession } from '../lib/session.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
const router = Router();
const attempts = new Map();
function limit(req, res, next) {
 const now = Date.now();
 for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
 const key = req.ip; const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
 entry.count++; attempts.set(key, entry);
 if (entry.count > 30) { res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000))); return res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' }); }
 next();
}
const safe = user => Object.fromEntries(Object.keys(publicUser).map(key => [key, user[key]]));
router.post('/register', limit, async (req, res) => {
 const values = profileValues(req.body || {});
 const password = passwordValue(req.body.password);
 if ('role' in req.body || 'id' in req.body) fail('Account roles cannot be selected during registration.');
 if (values.email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) fail('This email is reserved. Please use a different email.', 409);
 const user = await prisma.user.create({ data: { ...values, passwordHash: await hashPassword(password), role: 'USER' } });
 createSession(res, user); res.status(201).json({ user: safe(user) });
});
router.post('/login', limit, async (req, res) => {
 const email = emailValue(req.body?.email);
 const password = passwordValue(req.body?.password);
 const user = await prisma.user.findUnique({ where: { email } });
 const hash = user?.passwordHash || await hashPassword('not-a-real-account-password');
 if (!await checkPassword(password, hash) || !user) fail('Email or password is incorrect.', 401);
 createSession(res, user); res.json({ user: safe(user) });
});
router.get('/me', requireAuth, (req, res) => res.json({ user: safe(req.user) }));
router.post('/logout', requireAuth, async (req, res) => {
 await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
 clearSession(res); res.json({ message: 'You have been logged out.' });
});
router.post('/forgot-password', limit, (req, res) => {
 emailValue(req.body?.email);
 res.json({ message: 'Local preview: your request has been received. No email is sent and your password has not changed. Contact the local project administrator for help.' });
});
router.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ message: 'Administrator access verified.' }));
export default router;

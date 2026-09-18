import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
export async function requireAuth(req, res, next) {
 const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('relive_session='));
 const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
 let claims;
 try { claims = verifyToken(bearer || cookie?.slice('relive_session='.length) || ''); }
 catch { return res.status(401).json({ error: 'Please log in to continue.' }); }
 try {
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.tokenVersion !== claims.version) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  req.user = user; next();
 } catch (error) { next(error); }
}
export function requireAdmin(req, res, next) {
 if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access required.' });
 next();
}

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireMember } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth, requireMember);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (req, res) => {
  const userId = req.user.id;
  const [listingGroups, offersMade, offersReceived, purchases, sales, favourites, notifications] =
    await prisma.$transaction([
      prisma.listing.groupBy({ where: { sellerId: userId }, by: ['status'], _count: { _all: true } }),
      prisma.offer.count({ where: { buyerId: userId, status: { in: ['PENDING', 'COUNTERED'] } } }),
      prisma.offer.count({ where: { sellerId: userId, status: { in: ['PENDING', 'COUNTERED'] } } }),
      prisma.purchase.count({ where: { buyerId: userId } }),
      prisma.purchase.count({ where: { sellerId: userId } }),
      prisma.favourite.count({ where: { userId, listing: { status: 'ACTIVE' } } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);
  const count = (status) => listingGroups.find((item) => item.status === status)?._count._all || 0;
  res.json({
    counts: {
      activeListings: count('ACTIVE'), reservedListings: count('RESERVED'),
      soldItems: count('SOLD'), needsRevision: count('NEEDS_REVISION'),
      offersMade, offersReceived, purchases, sales, favourites,
    },
    walletBalance: req.user.walletBalance / 100,
    notifications,
    unreadNotifications: notifications.filter((item) => !item.readAt).length,
  });
});

router.post('/notifications/read', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ message: 'Notifications marked as read.' });
});

export default router;

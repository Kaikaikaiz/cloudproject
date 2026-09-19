import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { fail } from '../lib/validation.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      profileImage: true,
      state: true,
      city: true,
      createdAt: true,
      averageRating: true,
      totalReviews: true,
      completedTransactions: true,
      reviewsReceived: {
        where: { transaction: { status: 'COMPLETED' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          reviewer: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    fail('User not found.', 404);
  }

  res.set('Cache-Control', 'no-store');
  const { reviewsReceived, ...profile } = user;
  res.json({ user: profile, reviews: reviewsReceived });
});

export default router;

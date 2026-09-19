import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireMember } from '../middleware/requireAuth.js';
import { fail } from '../lib/validation.js';

const router = Router();
const participantSelect = { id: true, name: true, profileImage: true };
const transactionInclude = {
  buyer: { select: participantSelect },
  seller: { select: participantSelect },
  purchase: { select: { listingTitle: true, reference: true } },
  reviews: { orderBy: { createdAt: 'asc' } },
};

function serializeTransaction(transaction, userId) {
  return {
    ...transaction,
    originalPrice: transaction.originalPrice / 100,
    finalPrice: transaction.finalPrice / 100,
    canReview:
      transaction.status === 'COMPLETED' &&
      transaction.buyerId !== transaction.sellerId &&
      !transaction.reviews.some((review) => review.reviewerId === userId),
  };
}

async function findTransaction(database, id, userId) {
  const transaction = await database.transaction.findFirst({
    where: { id, OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: transactionInclude,
  });

  if (!transaction) {
    fail('Transaction not found.', 404);
  }

  return transaction;
}

router.use(requireAuth);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (req, res) => {
  const direction = req.query.direction || 'purchases';
  if (!['purchases', 'sales'].includes(direction)) {
    fail('Choose purchases or sales.');
  }

  const transactions = await prisma.transaction.findMany({
    where: direction === 'sales' ? { sellerId: req.user.id } : { buyerId: req.user.id },
    include: transactionInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  res.json({
    transactions: transactions.map((transaction) =>
      serializeTransaction(transaction, req.user.id),
    ),
  });
});

router.get('/:id', async (req, res) => {
  const transaction = await findTransaction(prisma, req.params.id, req.user.id);
  res.json({ transaction: serializeTransaction(transaction, req.user.id) });
});

router.post('/:id/reviews', requireMember, async (req, res) => {
  const { rating, comment = '' } = req.body || {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail('Choose a whole-number rating from 1 to 5.');
  }

  if (typeof comment !== 'string' || comment.trim().length > 1000) {
    fail('Your comment must be 1,000 characters or fewer.');
  }

  // Locking, the unique review constraint and the aggregate share one transaction.
  const review = await prisma.$transaction(async (database) => {
    const transaction = await findTransaction(database, req.params.id, req.user.id);
    if (transaction.status !== 'COMPLETED') {
      fail('Only completed transactions can be reviewed.', 409);
    }

    const reviewedUserId =
      transaction.buyerId === req.user.id ? transaction.sellerId : transaction.buyerId;

    if (reviewedUserId === req.user.id) {
      fail('You cannot review yourself.', 403);
    }

    if (transaction.reviews.some((entry) => entry.reviewerId === req.user.id)) {
      fail('You have already reviewed this transaction.', 409);
    }

    const created = await database.review.create({
      data: {
        transactionId: transaction.id,
        reviewerId: req.user.id,
        reviewedUserId,
        rating,
        comment: comment.trim() || null,
      },
    });

    const reputation = await database.review.aggregate({
      where: { reviewedUserId, transaction: { status: 'COMPLETED' } },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await database.user.update({
      where: { id: reviewedUserId },
      data: {
        averageRating: reputation._avg.rating || 0,
        totalReviews: reputation._count.rating,
      },
    });

    return created;
  });

  res.status(201).json({ review });
});

router.use((error, _req, res, next) => {
  if (['P2002', 'P2034', 'P1008', 'P2028'].includes(error.code)) {
    return res.status(409).json({
      error:
        'This review changed while saving. Refresh the transaction before trying again.',
    });
  }

  next(error);
});

export default router;

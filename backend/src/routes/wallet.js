import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { fail } from '../lib/validation.js';
import { money } from '../lib/listings.js';
import {
  createReference,
  maximumWalletBalance,
  paymentErrorHandler,
  serializeWalletTransaction,
  validateRequestKey,
} from '../lib/payments.js';

const router = Router();

router.use(requireAuth);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

async function findTopUp(transaction, id, userId) {
  const topUp = await transaction.walletTransaction.findFirst({
    where: { id, userId, type: 'TOP_UP' },
  });

  if (!topUp) {
    fail('Top-up not found.', 404);
  }

  return topUp;
}

router.get('/', async (req, res) => {
  const [user, earnings, transactions] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: req.user.id },
      select: { walletBalance: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId: req.user.id, type: 'SALE', status: 'SUCCESS' },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.findMany({
      where: { userId: req.user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  ]);

  res.json({
    balance: user.walletBalance / 100,
    sellerEarnings: (earnings._sum.amount || 0) / 100,
    transactions: transactions.map(serializeWalletTransaction),
  });
});

router.post('/top-ups', async (req, res) => {
  const amount = money(req.body?.amount, 'Top-up amount');
  const method = req.body?.method;
  const requestKey = validateRequestKey(req.body?.requestKey);

  if (amount <= 0) {
    fail('Top up at least RM 0.01.');
  }

  if (!['FPX', 'TNG'].includes(method)) {
    fail('Choose mock FPX Online Banking or Touch ’n Go eWallet.');
  }

  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.walletTransaction.findUnique({
      where: { userId_requestKey: { userId: req.user.id, requestKey } },
    });

    if (existing) {
      if (
        existing.type !== 'TOP_UP' ||
        existing.amount !== amount ||
        existing.method !== method
      ) {
        fail('This request was already used for a different top-up.', 409);
      }

      return { topUp: existing, created: false };
    }

    const topUp = await transaction.walletTransaction.create({
      data: {
        userId: req.user.id,
        type: 'TOP_UP',
        amount,
        method,
        requestKey,
        reference: createReference('MOCK'),
      },
    });

    return { topUp, created: true };
  });

  res.status(result.created ? 201 : 200).json({
    topUp: serializeWalletTransaction(result.topUp),
  });
});

router.get('/top-ups/:id', async (req, res) => {
  const topUp = await findTopUp(prisma, req.params.id, req.user.id);

  res.json({ topUp: serializeWalletTransaction(topUp) });
});

router.post('/top-ups/:id/confirm', async (req, res) => {
  const topUp = await prisma.$transaction(async (transaction) => {
    const payment = await findTopUp(transaction, req.params.id, req.user.id);

    if (payment.status === 'SUCCESS') {
      return payment;
    }

    if (payment.status !== 'PENDING') {
      fail('This top-up is no longer awaiting payment.', 409);
    }

    const confirmed = await transaction.walletTransaction.updateMany({
      where: { id: payment.id, userId: req.user.id, status: 'PENDING' },
      data: { status: 'SUCCESS' },
    });

    if (confirmed.count !== 1) {
      fail('This top-up has already been processed. Refresh its status.', 409);
    }

    const credited = await transaction.user.updateMany({
      where: {
        id: req.user.id,
        walletBalance: { lte: maximumWalletBalance - payment.amount },
      },
      data: { walletBalance: { increment: payment.amount } },
    });

    if (credited.count !== 1) {
      fail('This top-up would exceed the wallet balance limit.', 409);
    }

    return transaction.walletTransaction.findUnique({ where: { id: payment.id } });
  });

  res.json({ topUp: serializeWalletTransaction(topUp) });
});

router.post('/top-ups/:id/cancel', async (req, res) => {
  const topUp = await prisma.$transaction(async (transaction) => {
    const payment = await findTopUp(transaction, req.params.id, req.user.id);

    if (payment.status === 'CANCELLED') {
      return payment;
    }

    if (payment.status !== 'PENDING') {
      fail('A completed top-up cannot be cancelled.', 409);
    }

    const cancelled = await transaction.walletTransaction.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    if (cancelled.count !== 1) {
      fail('This top-up has already changed. Refresh its status.', 409);
    }

    return transaction.walletTransaction.findUnique({ where: { id: payment.id } });
  });

  res.json({ topUp: serializeWalletTransaction(topUp) });
});

router.use(paymentErrorHandler);

export default router;

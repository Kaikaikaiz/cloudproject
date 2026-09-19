import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireMember } from '../middleware/requireAuth.js';
import { fail } from '../lib/validation.js';
import { money } from '../lib/listings.js';
import { closeOpenOffers } from '../lib/offers.js';
import {
  createReference,
  loadCheckout,
  maximumWalletBalance,
  paymentErrorHandler,
  purchaseInclude,
  serializeCheckout,
  serializePurchase,
  validateRequestKey,
} from '../lib/payments.js';

const router = Router();

router.use(requireAuth, requireMember);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/quote', async (req, res) => {
  const checkout = await prisma.$transaction((transaction) =>
    loadCheckout(
      transaction,
      req.user.id,
      req.query.listingId,
      req.query.offerId || null,
    ),
  );

  res.json({ checkout: serializeCheckout(checkout) });
});

router.post('/', async (req, res) => {
  const { listingId, offerId = null, listingUpdatedAt } = req.body || {};
  const requestKey = validateRequestKey(req.body?.requestKey);
  const expectedAmount = money(req.body?.expectedAmount, 'Confirmed amount');

  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.purchase.findUnique({
      where: { buyerId_requestKey: { buyerId: req.user.id, requestKey } },
      include: purchaseInclude,
    });

    if (existing) {
      if (
        existing.listingId !== listingId ||
        existing.offerId !== offerId ||
        existing.amount !== expectedAmount
      ) {
        fail('This request was already used for a different purchase.', 409);
      }

      return { purchase: existing, created: false };
    }

    const checkout = await loadCheckout(transaction, req.user.id, listingId, offerId);
    const { listing, offer, amount } = checkout;

    if (
      amount !== expectedAmount ||
      listing.updatedAt.toISOString() !== listingUpdatedAt
    ) {
      fail('The listing or price has changed. Refresh checkout before confirming.', 409);
    }

    // Claim the listing and move both balances within one transaction.
    const sold = await transaction.listing.updateMany({
      where: { id: listing.id, status: listing.status, updatedAt: listing.updatedAt },
      data: { status: 'SOLD' },
    });

    if (sold.count !== 1) {
      fail('This listing has already changed or been purchased.', 409);
    }

    const debited = await transaction.user.updateMany({
      where: { id: req.user.id, walletBalance: { gte: amount } },
      data: {
        walletBalance: { decrement: amount },
        completedTransactions: { increment: 1 },
      },
    });

    if (debited.count !== 1) {
      fail('Your wallet has insufficient funds. Top up and try again.', 402);
    }

    const credited = await transaction.user.updateMany({
      where: {
        id: listing.sellerId,
        walletBalance: { lte: maximumWalletBalance - amount },
      },
      data: {
        walletBalance: { increment: amount },
        completedTransactions: { increment: 1 },
      },
    });

    if (credited.count !== 1) {
      fail('The seller’s wallet cannot receive this payment right now.', 409);
    }

    if (offer) {
      const completed = await transaction.offer.updateMany({
        where: { id: offer.id, status: 'ACCEPTED', version: offer.version },
        data: { status: 'COMPLETED', nextActorId: null, version: { increment: 1 } },
      });

      if (completed.count !== 1) {
        fail('This accepted offer has already changed.', 409);
      }

      await transaction.offerHistory.create({
        data: {
          offerId: offer.id,
          userId: req.user.id,
          amount,
          action: 'COMPLETED',
        },
      });
    }

    await closeOpenOffers(
      transaction,
      listing.id,
      req.user.id,
      'LISTING_SOLD',
      offer?.id,
    );

    const purchase = await transaction.purchase.create({
      data: {
        listingId: listing.id,
        buyerId: req.user.id,
        sellerId: listing.sellerId,
        offerId: offer?.id || null,
        listingTitle: listing.title,
        amount,
        reference: createReference('RELIVE'),
        requestKey,
        transaction: {
          create: {
            listingId: listing.id,
            buyerId: req.user.id,
            sellerId: listing.sellerId,
            originalPrice: offer?.originalPrice ?? listing.price,
            finalPrice: amount,
          },
        },
      },
      include: purchaseInclude,
    });

    await transaction.walletTransaction.createMany({
      data: [
        {
          userId: req.user.id,
          purchaseId: purchase.id,
          type: 'PURCHASE',
          amount,
          method: 'WALLET',
          status: 'SUCCESS',
          reference: purchase.reference,
        },
        {
          userId: listing.sellerId,
          purchaseId: purchase.id,
          type: 'SALE',
          amount,
          method: 'WALLET',
          status: 'SUCCESS',
          reference: purchase.reference,
        },
      ],
    });

    return { purchase, created: true };
  });

  res.status(result.created ? 201 : 200).json({
    purchase: serializePurchase(result.purchase),
  });
});

router.get('/:id', async (req, res) => {
  const purchase = await prisma.purchase.findFirst({
    where: {
      id: req.params.id,
      OR: [{ buyerId: req.user.id }, { sellerId: req.user.id }],
    },
    include: purchaseInclude,
  });

  if (!purchase) {
    fail('Purchase not found.', 404);
  }

  res.json({ purchase: serializePurchase(purchase) });
});

router.use(paymentErrorHandler);

export default router;

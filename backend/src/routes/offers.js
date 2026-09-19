import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { fail } from '../lib/validation.js';
import { requireAuth, requireMember } from '../middleware/requireAuth.js';
import {
  closeOpenOffers,
  findParticipantOffer,
  getAllowedActions,
  offerInclude,
  openOfferStatuses,
  parseOfferAmount,
  serializeOffer,
} from '../lib/offers.js';

const router = Router();

router.use(requireAuth, requireMember);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (req, res) => {
  const direction = req.query.direction || 'made';

  if (!['made', 'received'].includes(direction)) {
    fail('Choose offers made or offers received.');
  }

  const where =
    direction === 'made' ? { buyerId: req.user.id } : { sellerId: req.user.id };

  const offers = await prisma.offer.findMany({
    where,
    include: offerInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });

  res.json({
    offers: offers.map((offer) => serializeOffer(offer, req.user.id)),
  });
});

router.post('/', async (req, res) => {
  const { listingId, amount } = req.body || {};

  if (typeof listingId !== 'string' || !listingId) {
    fail('Choose a listing before making an offer.');
  }

  const currentAmount = parseOfferAmount(amount);

  const offer = await prisma.$transaction(async (transaction) => {
    const listing = await transaction.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing || listing.status !== 'ACTIVE') {
      fail('This listing is no longer available for offers.', 409);
    }

    if (listing.sellerId === req.user.id) {
      fail('You cannot bargain on your own listing.', 403);
    }

    const existingOffer = await transaction.offer.findFirst({
      where: {
        listingId,
        buyerId: req.user.id,
        status: { in: openOfferStatuses },
      },
    });

    if (existingOffer) {
      fail(
        'You already have an open offer for this listing. Continue it in Offers Made.',
        409,
      );
    }

    return transaction.offer.create({
      data: {
        listingId,
        buyerId: req.user.id,
        sellerId: listing.sellerId,
        originalPrice: listing.price,
        currentAmount,
        nextActorId: listing.sellerId,
        history: {
          create: {
            userId: req.user.id,
            amount: currentAmount,
            action: 'OFFERED',
          },
        },
      },
      include: offerInclude,
    });
  });

  res.status(201).json({ offer: serializeOffer(offer, req.user.id) });
});

router.get('/:id', async (req, res) => {
  const offer = await findParticipantOffer(prisma, req.params.id, req.user.id);

  res.json({ offer: serializeOffer(offer, req.user.id) });
});

router.post('/:id/actions', async (req, res) => {
  const { action, version, amount } = req.body || {};

  if (!['accept', 'reject', 'counter', 'cancel'].includes(action)) {
    fail('Choose a valid offer action.');
  }

  if (!Number.isSafeInteger(version) || version < 0) {
    fail('Refresh this offer before responding.');
  }

  const counterAmount = action === 'counter' ? parseOfferAmount(amount) : null;

  const updatedOffer = await prisma.$transaction(async (transaction) => {
    const offer = await findParticipantOffer(transaction, req.params.id, req.user.id);

    if (offer.version !== version) {
      fail('This offer has changed. Refresh it before responding.', 409);
    }

    if (!openOfferStatuses.includes(offer.status)) {
      fail('This negotiation has already ended.', 409);
    }

    if (offer.listing.status !== 'ACTIVE') {
      fail('This listing is no longer available for negotiation.', 409);
    }

    if (!getAllowedActions(offer, req.user.id).includes(action)) {
      fail('It is not your turn to take this action.', 403);
    }

    if (action === 'counter' && counterAmount === offer.currentAmount) {
      fail('Enter a different amount, or accept the current offer.');
    }

    const isBuyer = req.user.id === offer.buyerId;
    const nextParticipantId = isBuyer ? offer.sellerId : offer.buyerId;
    const changes = {
      nextActorId: null,
      version: { increment: 1 },
    };
    let historyAction;

    switch (action) {
      case 'counter':
        changes.status = 'COUNTERED';
        changes.currentAmount = counterAmount;
        changes.nextActorId = nextParticipantId;
        historyAction = isBuyer ? 'OFFERED' : 'COUNTERED';
        break;
      case 'accept':
        changes.status = 'ACCEPTED';
        changes.agreedPrice = offer.currentAmount;
        historyAction = 'ACCEPTED';
        break;
      case 'reject':
        changes.status = 'REJECTED';
        historyAction = 'REJECTED';
        break;
      case 'cancel':
        changes.status = 'CANCELLED';
        historyAction = 'CANCELLED';
        break;
    }

    const changed = await transaction.offer.updateMany({
      where: {
        id: offer.id,
        version,
        status: { in: openOfferStatuses },
      },
      data: changes,
    });

    if (changed.count !== 1) {
      fail('This offer has changed. Refresh it before responding.', 409);
    }

    await transaction.offerHistory.create({
      data: {
        offerId: offer.id,
        userId: req.user.id,
        amount: counterAmount ?? offer.currentAmount,
        action: historyAction,
      },
    });

    if (action === 'accept') {
      // Reserve and close competing negotiations in the same database transaction.
      const reserved = await transaction.listing.updateMany({
        where: { id: offer.listingId, status: 'ACTIVE' },
        data: { status: 'RESERVED' },
      });

      if (reserved.count !== 1) {
        fail('Another offer was already accepted for this listing.', 409);
      }

      await closeOpenOffers(
        transaction,
        offer.listingId,
        req.user.id,
        'ANOTHER_OFFER_ACCEPTED',
        offer.id,
      );
    }

    return transaction.offer.findUnique({
      where: { id: offer.id },
      include: offerInclude,
    });
  });

  res.json({ offer: serializeOffer(updatedOffer, req.user.id) });
});

router.use((error, _req, res, next) => {
  if (['P2034', 'P1008', 'P2028', 'P2002'].includes(error.code)) {
    return res.status(409).json({
      error: 'This negotiation changed while you were responding. Refresh and try again.',
    });
  }

  next(error);
});

export default router;

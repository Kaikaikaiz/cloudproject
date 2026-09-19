import { fail } from './validation.js';
import { listingInclude, money, serializeListing } from './listings.js';

export const openOfferStatuses = ['PENDING', 'COUNTERED'];

export const offerStatuses = [
  'PENDING',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'CLOSED',
  'COMPLETED',
];

const participantFields = {
  id: true,
  name: true,
  profileImage: true,
};

export const offerInclude = {
  listing: { include: listingInclude },
  buyer: { select: participantFields },
  seller: { select: participantFields },
  history: { orderBy: { id: 'asc' } },
  purchase: { select: { id: true } },
};

export function parseOfferAmount(value) {
  const amount = money(value, 'Offer amount');

  if (amount <= 0) {
    fail('Offer amount must be at least RM 0.01.');
  }

  return amount;
}

export function getAllowedActions(offer, userId) {
  const isParticipant = offer.buyerId === userId || offer.sellerId === userId;

  if (
    !isParticipant ||
    !openOfferStatuses.includes(offer.status) ||
    offer.listing.status !== 'ACTIVE'
  ) {
    return [];
  }

  const actions = [];

  if (offer.nextActorId === userId) {
    actions.push('accept', 'reject', 'counter');
  }

  if (offer.buyerId === userId) {
    actions.push('cancel');
  }

  return actions;
}

export function serializeOffer(offer, userId) {
  return {
    ...offer,
    originalPrice: offer.originalPrice / 100,
    currentAmount: offer.currentAmount / 100,
    agreedPrice: offer.agreedPrice === null ? null : offer.agreedPrice / 100,
    listing: serializeListing(offer.listing),
    history: offer.history.map((entry) => ({
      ...entry,
      amount: entry.amount / 100,
    })),
    allowedActions: getAllowedActions(offer, userId),
  };
}

export async function findParticipantOffer(transaction, offerId, userId) {
  const offer = await transaction.offer.findUnique({
    where: { id: offerId },
    include: offerInclude,
  });

  if (!offer) {
    fail('Offer not found.', 404);
  }

  if (offer.buyerId !== userId && offer.sellerId !== userId) {
    fail('Only the buyer and seller can access this negotiation.', 403);
  }

  return offer;
}

export async function closeOpenOffers(
  transaction,
  listingId,
  userId,
  closeReason,
  exceptOfferId,
) {
  const where = {
    listingId,
    status: { in: openOfferStatuses },
  };

  if (exceptOfferId) {
    where.id = { not: exceptOfferId };
  }

  const offers = await transaction.offer.findMany({ where });

  if (offers.length === 0) {
    return;
  }

  await transaction.offer.updateMany({
    where,
    data: {
      status: 'CLOSED',
      nextActorId: null,
      closeReason,
      version: { increment: 1 },
    },
  });

  await transaction.offerHistory.createMany({
    data: offers.map((offer) => ({
      offerId: offer.id,
      userId,
      amount: offer.currentAmount,
      action: 'CLOSED',
    })),
  });
}

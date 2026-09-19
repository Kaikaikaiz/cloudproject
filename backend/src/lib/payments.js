import { randomUUID } from 'node:crypto';
import { fail } from './validation.js';
import { listingInclude, serializeListing } from './listings.js';

export const maximumWalletBalance = 2147483647;

export function validateRequestKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(value)) {
    fail('A valid payment request key is required.');
  }

  return value;
}

export function createReference(prefix) {
  return prefix + '-' + randomUUID().toUpperCase();
}

export function serializeWalletTransaction(transaction) {
  const { requestKey, ...details } = transaction;

  return { ...details, amount: transaction.amount / 100 };
}

export const purchaseInclude = {
  buyer: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
};

export function serializePurchase(purchase) {
  const { requestKey, ...details } = purchase;

  return { ...details, amount: purchase.amount / 100 };
}

export async function loadCheckout(transaction, buyerId, listingId, offerId = null) {
  if (typeof listingId !== 'string' || !listingId) {
    fail('Choose a listing to purchase.');
  }

  if (offerId !== null && (typeof offerId !== 'string' || !offerId)) {
    fail('Choose a valid accepted offer.');
  }

  const listing = await transaction.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });

  if (!listing) {
    fail('Listing not found.', 404);
  }

  if (listing.sellerId === buyerId) {
    fail('You cannot purchase your own listing.', 403);
  }

  let offer = null;
  let amount = listing.price;

  if (offerId) {
    offer = await transaction.offer.findUnique({ where: { id: offerId } });

    if (
      !offer ||
      offer.buyerId !== buyerId ||
      offer.sellerId !== listing.sellerId ||
      offer.listingId !== listing.id
    ) {
      fail('This accepted offer does not belong to your purchase.', 403);
    }

    if (
      offer.status !== 'ACCEPTED' ||
      listing.status !== 'RESERVED' ||
      offer.agreedPrice === null
    ) {
      fail('This offer is no longer available for payment.', 409);
    }

    amount = offer.agreedPrice;
  } else if (listing.status !== 'ACTIVE') {
    fail('Buy Now is only available for ACTIVE listings.', 409);
  }

  const buyer = await transaction.user.findUnique({
    where: { id: buyerId },
    select: { walletBalance: true },
  });

  return { listing, offer, amount, balance: buyer.walletBalance };
}

export function serializeCheckout(checkout) {
  return {
    listing: serializeListing(checkout.listing),
    offerId: checkout.offer?.id || null,
    amount: checkout.amount / 100,
    balance: checkout.balance / 100,
    sufficientBalance: checkout.balance >= checkout.amount,
    listingUpdatedAt: checkout.listing.updatedAt,
  };
}

export function paymentErrorHandler(error, _req, res, next) {
  if (['P2034', 'P1008', 'P2028', 'P2002'].includes(error.code)) {
    return res.status(409).json({
      error: 'This payment changed while it was being processed. Refresh or retry the same payment.',
    });
  }

  next(error);
}


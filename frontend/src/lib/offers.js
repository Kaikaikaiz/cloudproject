import { rm } from './listings';

export function getOfferMessage(offer, userId) {
  switch (offer.status) {
    case 'ACCEPTED':
      return 'Agreed at ' + rm(offer.agreedPrice) + '. The listing is reserved.';
    case 'REJECTED':
      return 'This offer was rejected. The negotiation has ended.';
    case 'CANCELLED':
      return 'The buyer cancelled this negotiation.';
    case 'CLOSED':
      return offer.closeReason === 'LISTING_WITHDRAWN'
        ? 'The seller withdrew this listing.'
        : 'Another offer was accepted for this listing.';
    case 'COMPLETED':
      return 'This negotiation is complete.';
    default:
      if (offer.listing.status !== 'ACTIVE') {
        return 'This listing is no longer available for negotiation.';
      }

      return offer.nextActorId === userId
        ? 'Your turn to respond.'
        : 'Waiting for the ' + (userId === offer.buyerId ? 'seller' : 'buyer') + '.';
  }
}

export function getHistoryMessage(entry, offer) {
  if (entry.action === 'CLOSED') {
    return offer.closeReason === 'LISTING_WITHDRAWN'
      ? 'Negotiation closed because the listing was withdrawn.'
      : 'Negotiation closed because another offer was accepted.';
  }

  const role = entry.userId === offer.buyerId ? 'Buyer' : 'Seller';
  const amount = rm(entry.amount);

  switch (entry.action) {
    case 'OFFERED':
      return role + ' offered ' + amount;
    case 'COUNTERED':
      return role + ' countered ' + amount;
    case 'ACCEPTED':
      return role + ' accepted ' + amount;
    case 'REJECTED':
      return role + ' rejected ' + amount;
    case 'CANCELLED':
      return role + ' cancelled the offer of ' + amount;
    case 'COMPLETED':
      return 'Transaction completed at ' + amount;
    default:
      return role + ' updated the offer.';
  }
}

import { randomUUID, createHash } from 'node:crypto';
import { fail } from '../lib/validation.js';
import { money } from '../lib/listings.js';
import { getAllowedActions, parseOfferAmount, openOfferStatuses } from '../lib/offers.js';
import {
  maximumWalletBalance,
  validateRequestKey,
  createReference,
} from '../lib/payments.js';

const fresh = (values) => ({
  id: randomUUID(),
  version: 0,
  createdAt: new Date().toISOString(),
  ...values,
});
const changed = (old, values = {}) => ({
  ...old,
  ...values,
  version: old.version + 1,
  updatedAt: new Date(
    Math.max(Date.now(), Date.parse(old.updatedAt || old.createdAt) + 1),
  ).toISOString(),
});
const entry = (type, item, old, participants) => ({ type, item, old, participants });
const clean = ({
  PK,
  SK,
  requestKey,
  buyerPK,
  buyerSK,
  sellerPK,
  sellerSK,
  listingPK,
  listingSK,
  userPK,
  userSK,
  reviewedPK,
  reviewedSK,
  ...item
}) => item;
const requestId = (user, type, request) =>
  createHash('sha256')
    .update(JSON.stringify([user, type, request]))
    .digest('hex');
export function createCommerce(context) {
  const { store, serialize, safe } = context;
  const db = store.commerce;
  const participant = async (id) => {
    const user = await store.user(id);
    if (!user) fail('Account not found.', 404);
    return user;
  };
  const visible = (record, user) => {
    if (!record) fail('Record not found.', 404);
    if (record.buyerId !== user && record.sellerId !== user && record.userId !== user)
      fail('This record is private.', 403);
    return record;
  };
  const notification = (userId, message, link) =>
    entry('NOTICE', fresh({ userId, message, link, readAt: null }), null, [userId]);
  async function offerView(record, userId) {
    const listing = await store.listing(record.listingId);
    // Listing state is the atomic authority for closing competing negotiations.
    const closed =
      openOfferStatuses.includes(record.status) && (listing?.status !== 'ACTIVE' || (listing?.moderationClosedAt && record.createdAt <= listing.moderationClosedAt));
    const offer = closed
      ? {
          ...record,
          status: 'CLOSED',
          nextActorId: null,
          closeReason:
            listing?.status === 'SOLD' ? 'LISTING_SOLD' : 'LISTING_UNAVAILABLE',
        }
      : record;
    return {
      ...clean(offer),
      originalPrice: offer.originalPrice / 100,
      currentAmount: offer.currentAmount / 100,
      agreedPrice: offer.agreedPrice == null ? null : offer.agreedPrice / 100,
      listing: listing ? await serialize(listing) : null,
      buyer: await safe(await participant(offer.buyerId), true),
      seller: await safe(await participant(offer.sellerId), true),
      history: offer.history.map((h) => ({ ...clean(h), amount: h.amount / 100 })),
      purchase: offer.purchaseId ? { id: offer.purchaseId } : null,
      allowedActions: listing ? getAllowedActions({ ...offer, listing }, userId) : [],
    };
  }
  async function purchaseView(p) {
    return {
      ...clean(p),
      amount: p.amount / 100,
      method: 'WALLET',
      transaction: { id: p.id },
      buyer: await safe(await participant(p.buyerId), true),
      seller: await safe(await participant(p.sellerId), true),
    };
  }
  const walletView = (p) => ({ ...clean(p), amount: p.amount / 100 });
  async function checkout(userId, listingId, offerId = null) {
    if (typeof listingId !== 'string' || !listingId)
      fail('Choose a listing to purchase.');
    const listing = await store.listing(listingId);
    if (!listing?.id) fail('Listing not found.', 404);
    if (listing.sellerId === userId) fail('You cannot purchase your own listing.', 403);
    let offer = null,
      amount = listing.price;
    if (offerId) {
      offer = await db.record('OFFER', offerId);
      if (
        !offer ||
        offer.buyerId !== userId ||
        offer.listingId !== listingId ||
        offer.sellerId !== listing.sellerId
      )
        fail('This offer does not belong to your purchase.', 403);
      if (
        offer.status !== 'ACCEPTED' ||
        listing.status !== 'RESERVED' ||
        listing.acceptedOfferId !== offer.id
      )
        fail('This offer is no longer available for payment.', 409);
      amount = offer.agreedPrice;
    } else if (listing.status !== 'ACTIVE')
      fail('Buy Now is only available for ACTIVE listings.', 409);
    const buyer = await participant(userId);
    return { listing, offer, amount, buyer };
  }
  return {
    async offersPage(userId, direction = 'made', paging) {
      if (!['made', 'received'].includes(direction))
        fail('Choose offers made or received.');
      const page = await db.page(userId, 'OFFER', { ...paging, direction });
      return {
        offers: await Promise.all(page.items.map((o) => offerView(o, userId))),
        nextCursor: paging.encode(page.cursor),
      };
    },
    async walletPage(userId, paging) {
      const [user, page] = await Promise.all([
        participant(userId),
        db.page(userId, 'WALLET', paging),
      ]);
      return {
        balance: user.walletBalance / 100,
        sellerEarnings: (user.walletEarnings || 0) / 100,
        transactions: page.items.map(walletView),
        nextCursor: paging.encode(page.cursor),
      };
    },
    async transactionsPage(userId, direction = 'purchases', paging) {
      if (!['purchases', 'sales'].includes(direction)) fail('Choose purchases or sales.');
      const page = await db.page(userId, 'PURCHASE', { ...paging, direction });
      return {
        transactions: await Promise.all(
          page.items.map((p) => this.transaction(userId, p.id)),
        ),
        nextCursor: paging.encode(page.cursor),
      };
    },
    async offers(userId, direction = 'made') {
      if (!['made', 'received'].includes(direction))
        fail('Choose offers made or received.');
      return Promise.all(
        (await db.records(userId, 'OFFER', direction))
          .filter((o) => o[direction === 'made' ? 'buyerId' : 'sellerId'] === userId)
          .map((o) => offerView(o, userId)),
      );
    },
    async offer(userId, id) {
      return offerView(visible(await db.record('OFFER', id), userId), userId);
    },
    async makeOffer(userId, body) {
      if (typeof body.listingId !== 'string' || !body.listingId)
        fail('Choose a listing before making an offer.');
      const amount = parseOfferAmount(body.amount),
        listing = await store.listing(body.listingId);
      if (!listing?.id || listing.status !== 'ACTIVE')
        fail('This listing is no longer available for offers.', 409);
      if (listing.sellerId === userId)
        fail('You cannot bargain on your own listing.', 403);
      const lockId = requestId(userId, 'offer', listing.id),
        lock = await db.record('NEGOTIATION', lockId);
      const existingOffer = lock ? await db.record('OFFER', lock.offerId) : null;
      if (existingOffer && openOfferStatuses.includes(existingOffer.status) && !(listing.moderationClosedAt && existingOffer.createdAt <= listing.moderationClosedAt))
        fail('You already have an open offer for this listing.', 409);
      const offer = fresh({
        listingId: listing.id,
        buyerId: userId,
        sellerId: listing.sellerId,
        originalPrice: listing.price,
        currentAmount: amount,
        agreedPrice: null,
        status: 'PENDING',
        nextActorId: listing.sellerId,
        history: [],
      });
      offer.updatedAt = offer.createdAt;
      offer.history.push({
        id: randomUUID(),
        userId,
        amount,
        action: 'OFFERED',
        createdAt: offer.createdAt,
      });
      await db.commit([
        entry('OFFER', offer, null, [userId, listing.sellerId]),
        entry(
          'NEGOTIATION',
          lock
            ? changed(lock, { offerId: offer.id })
            : fresh({ id: lockId, offerId: offer.id }),
          lock,
        ),
        entry('LISTING', changed(listing), listing),
        notification(
          listing.sellerId,
          `New offer on ${listing.title}.`,
          '/offers/' + offer.id,
        ),
      ]);
      return offerView(offer, userId);
    },
    async act(userId, id, body) {
      const old = visible(await db.record('OFFER', id), userId),
        listing = await store.listing(old.listingId);
      if (!Number.isSafeInteger(body.version) || body.version !== old.version)
        fail('This offer has changed. Refresh it.', 409);
      if (
        !listing ||
        listing.status !== 'ACTIVE' ||
        !openOfferStatuses.includes(old.status) ||
        (listing.moderationClosedAt && old.createdAt <= listing.moderationClosedAt)
      )
        fail('This negotiation has ended.', 409);
      if (!getAllowedActions({ ...old, listing }, userId).includes(body.action))
        fail('It is not your turn to take this action.', 403);
      const other = userId === old.buyerId ? old.sellerId : old.buyerId;
      const amount =
        body.action === 'counter' ? parseOfferAmount(body.amount) : old.currentAmount;
      if (body.action === 'counter' && amount === old.currentAmount)
        fail('Enter a different amount or accept the offer.');
      const status = {
        accept: 'ACCEPTED',
        reject: 'REJECTED',
        cancel: 'CANCELLED',
        counter: 'COUNTERED',
      }[body.action];
      const next = changed(old, {
        status,
        currentAmount: amount,
        nextActorId: body.action === 'counter' ? other : null,
        agreedPrice: body.action === 'accept' ? amount : null,
        history: [
          ...old.history,
          {
            id: randomUUID(),
            userId,
            amount,
            action: status,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      // Bound the embedded history below DynamoDB's item-size limit.
      if (next.history.length > 100 && body.action === 'counter')
        fail('Negotiation limit reached. Accept, reject or cancel this offer.', 409);
      await db.commit([
        entry('OFFER', next, old),
        entry(
          'LISTING',
          changed(
            listing,
            body.action === 'accept'
              ? { status: 'RESERVED', statusPK: 'STATUS#RESERVED', acceptedOfferId: id }
              : {},
          ),
          listing,
        ),
        notification(
          other,
          `${status.toLowerCase()} offer for ${listing.title}.`,
          '/offers/' + id,
        ),
      ]);
      return offerView(next, userId);
    },
    async wallet(userId) {
      const user = await participant(userId),
        rows = await db.records(userId, 'WALLET');
      return {
        balance: user.walletBalance / 100,
        sellerEarnings: (user.walletEarnings || 0) / 100,
        transactions: rows.map(walletView),
      };
    },
    async topUp(userId, id) {
      const p = visible(await db.record('WALLET', id), userId);
      if (p.type !== 'TOP_UP') fail('Top-up not found.', 404);
      return walletView(p);
    },
    async createTopUp(userId, body) {
      const amount = money(body.amount, 'Top-up amount'),
        requestKey = validateRequestKey(body.requestKey);
      if (amount <= 0 || !['FPX', 'TNG'].includes(body.method))
        fail('Choose a positive amount and mock FPX or TNG.');
      const id = requestId(userId, 'topup', requestKey),
        old = await db.record('WALLET', id);
      if (old) {
        if (old.amount !== amount || old.method !== body.method)
          fail('Request key already used for a different top-up.', 409);
        return { topUp: walletView(old), created: false };
      }
      const topUp = fresh({
        id,
        userId,
        amount,
        method: body.method,
        requestKey,
        type: 'TOP_UP',
        status: 'PENDING',
        reference: createReference('MOCK'),
      });
      await db.commit([entry('WALLET', topUp, null, [userId])]);
      return { topUp: walletView(topUp), created: true };
    },
    async settleTopUp(userId, id, action) {
      const old = visible(await db.record('WALLET', id), userId);
      if (old.type !== 'TOP_UP') fail('Top-up not found.', 404);
      const status = action === 'confirm' ? 'SUCCESS' : 'CANCELLED';
      if (old.status === status) return walletView(old);
      if (old.status !== 'PENDING') fail('This top-up has already been processed.', 409);
      const next = changed(old, { status }),
        changes = [entry('WALLET', next, old)];
      if (status === 'SUCCESS') {
        const user = await participant(userId);
        if (user.walletBalance + old.amount > maximumWalletBalance)
          fail('Wallet balance limit exceeded.', 409);
        changes.push(
          entry(
            'USER',
            changed(user, { walletBalance: user.walletBalance + old.amount }),
            user,
          ),
        );
      }
      await db.commit(changes);
      return walletView(next);
    },
    async quote(userId, listingId, offerId) {
      const q = await checkout(userId, listingId, offerId);
      return {
        listing: await serialize(q.listing),
        offerId: q.offer?.id || null,
        amount: q.amount / 100,
        balance: q.buyer.walletBalance / 100,
        sufficientBalance: q.buyer.walletBalance >= q.amount,
        listingUpdatedAt: q.listing.updatedAt,
      };
    },
    async buy(userId, body) {
      const requestKey = validateRequestKey(body.requestKey),
        expectedAmount = money(body.expectedAmount, 'Confirmed amount');
      const id = requestId(userId, 'purchase', requestKey),
        existing = await db.record('PURCHASE', id);
      if (existing) {
        if (
          existing.listingId !== body.listingId ||
          existing.offerId !== (body.offerId || null) ||
          existing.amount !== expectedAmount
        )
          fail('Request key already used for another purchase.', 409);
        return { purchase: await purchaseView(existing), created: false };
      }
      const { listing, offer, amount, buyer } = await checkout(
        userId,
        body.listingId,
        body.offerId,
      );
      if (amount !== expectedAmount || listing.updatedAt !== body.listingUpdatedAt)
        fail('Listing changed. Refresh checkout.', 409);
      if (buyer.walletBalance < amount) fail('Your wallet has insufficient funds.', 402);
      const seller = await participant(listing.sellerId);
      if (seller.walletBalance + amount > maximumWalletBalance)
        fail('Seller wallet balance limit exceeded.', 409);
      const purchase = fresh({
        id,
        buyerId: userId,
        sellerId: seller.id,
        listingId: listing.id,
        listingTitle: listing.title,
        offerId: offer?.id || null,
        amount,
        originalPrice: offer?.originalPrice ?? listing.price,
        requestKey,
        reference: createReference('RELIVE'),
        status: 'COMPLETED',
        reviews: [],
      });
      const changes = [
        entry('PURCHASE', purchase, null, [userId, seller.id]),
        entry(
          'LISTING',
          changed(listing, { status: 'SOLD', statusPK: 'STATUS#SOLD' }),
          listing,
        ),
        entry(
          'USER',
          changed(buyer, {
            walletBalance: buyer.walletBalance - amount,
            completedTransactions: buyer.completedTransactions + 1,
          }),
          buyer,
        ),
        entry(
          'USER',
          changed(seller, {
            walletBalance: seller.walletBalance + amount,
            walletEarnings: (seller.walletEarnings || 0) + amount,
            completedTransactions: seller.completedTransactions + 1,
          }),
          seller,
        ),
      ];
      for (const [owner, type] of [
        [userId, 'PURCHASE'],
        [seller.id, 'SALE'],
      ])
        changes.push(
          entry(
            'WALLET',
            fresh({
              userId: owner,
              purchaseId: id,
              type,
              amount,
              method: 'WALLET',
              status: 'SUCCESS',
              reference: purchase.reference,
            }),
            null,
            [owner],
          ),
        );
      if (offer)
        changes.push(
          entry(
            'OFFER',
            changed(offer, {
              status: 'COMPLETED',
              purchaseId: id,
              nextActorId: null,
              history: [
                ...offer.history,
                {
                  id: randomUUID(),
                  userId,
                  amount,
                  action: 'COMPLETED',
                  createdAt: purchase.createdAt,
                },
              ],
            }),
            offer,
          ),
        );
      await db.commit(changes);
      return { purchase: await purchaseView(purchase), created: true };
    },
    async purchase(userId, id) {
      return purchaseView(visible(await db.record('PURCHASE', id), userId));
    },
    async transaction(userId, id) {
      const p = visible(await db.record('PURCHASE', id), userId);
      return {
        ...(await purchaseView(p)),
        purchaseId: p.id,
        purchase: { listingTitle: p.listingTitle, reference: p.reference },
        originalPrice: p.originalPrice / 100,
        finalPrice: p.amount / 100,
        canReview: !p.reviews.some((r) => r.reviewerId === userId),
      };
    },
    async transactions(userId, direction = 'purchases') {
      if (!['purchases', 'sales'].includes(direction)) fail('Choose purchases or sales.');
      return Promise.all(
        (await db.records(userId, 'PURCHASE', direction))
          .filter((p) => p[direction === 'sales' ? 'sellerId' : 'buyerId'] === userId)
          .map((p) => this.transaction(userId, p.id)),
      );
    },
    async review(userId, id, body) {
      if (
        !Number.isInteger(body.rating) ||
        body.rating < 1 ||
        body.rating > 5 ||
        typeof (body.comment ?? '') !== 'string' ||
        (body.comment || '').trim().length > 1000
      )
        fail('Choose rating 1–5 and a comment up to 1,000 characters.');
      const p = visible(await db.record('PURCHASE', id), userId);
      if (p.reviews.some((r) => r.reviewerId === userId))
        fail('You already reviewed this transaction.', 409);
      const target = await participant(p.buyerId === userId ? p.sellerId : p.buyerId);
      const review = fresh({
        transactionId: id,
        reviewerId: userId,
        reviewedUserId: target.id,
        rating: body.rating,
        comment: body.comment?.trim() || null,
      });
      await db.commit([
        entry('PURCHASE', changed(p, { reviews: [...p.reviews, review] }), p),
        entry('REVIEW', review, null, [target.id]),
        entry(
          'USER',
          changed(target, {
            totalReviews: target.totalReviews + 1,
            averageRating:
              (target.averageRating * target.totalReviews + body.rating) /
              (target.totalReviews + 1),
          }),
          target,
        ),
      ]);
      return review;
    },
    async dashboard(userId, paging) {
      const [listings, offers, purchases, favs, notices, user] = await Promise.all([
        store.listings(userId),
        this.offers(userId),
        db.records(userId, 'PURCHASE'),
        store.favourites(userId),
        db.records(userId, 'NOTICE'),
        participant(userId),
      ]);
      const received = await this.offers(userId, 'received');
      const activeFavs = await Promise.all(favs.map((f) => store.listing(f.listingId)));
      const count = (status) => listings.filter((l) => l.status === status).length;
      const noticePage = paging ? await db.page(userId, 'NOTICE', paging) : null;
      return {
        counts: {
          activeListings: count('ACTIVE'),
          reservedListings: count('RESERVED'),
          soldItems: count('SOLD'),
          needsRevision: count('NEEDS_REVISION'),
          offersMade: offers.filter((o) => openOfferStatuses.includes(o.status)).length,
          offersReceived: received.filter((o) => openOfferStatuses.includes(o.status))
            .length,
          purchases: purchases.filter((p) => p.buyerId === userId).length,
          sales: purchases.filter((p) => p.sellerId === userId).length,
          favourites: activeFavs.filter((l) => l?.status === 'ACTIVE').length,
        },
        walletBalance: user.walletBalance / 100,
        notifications: (noticePage ? noticePage.items : notices.slice(0, 8)).map(clean),
        nextCursor: noticePage ? paging.encode(noticePage.cursor) : null,
        unreadNotifications: notices.filter((n) => !n.readAt).length,
      };
    },
    async readNotifications(userId) {
      const notices = (await db.records(userId, 'NOTICE')).filter((n) => !n.readAt);
      for (let i = 0; i < notices.length; i += 90)
        await db.commit(
          notices
            .slice(i, i + 90)
            .map((n) =>
              entry('NOTICE', changed(n, { readAt: new Date().toISOString() }), n),
            ),
        );
    },
  };
}

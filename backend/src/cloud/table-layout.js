// Shared by runtime storage and the offline migration; no AWS calls here.
export function domainTables(env = process.env) {
  return Object.fromEntries(
    [
      'users',
      'listings',
      'offers',
      'wallet',
      'purchases',
      'favourites',
      'notifications',
      'reviews',
    ].map((name) => [name, env[`${name.toUpperCase()}_TABLE`] || `relive-${name}`]),
  );
}
export function tableFor(type, tables) {
  const name = {
    USER: 'users',
    LISTING: 'listings',
    OFFER: 'offers',
    NEGOTIATION: 'offers',
    WALLET: 'wallet',
    BALANCE: 'wallet',
    PURCHASE: 'purchases',
    NOTICE: 'notifications',
    REVIEW: 'reviews',
  }[type];
  if (!name) throw new Error(`Unsupported record type ${type}`);
  return tables[name];
}
export function profileItem(user) {
  const { walletBalance, walletEarnings, balanceVersion, ...profile } = user;
  return profile;
}
export function layout(type, item) {
  const {
    PK,
    SK,
    history,
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
    ...data
  } = item;
  const sort = `${item.createdAt}#${item.id}`;
  if (type === 'USER')
    return { ...profileItem(item), PK: `USER#${item.id}`, SK: 'PROFILE' };
  if (type === 'BALANCE') return { ...data, PK: `USER#${item.id}`, SK: 'BALANCE' };
  if (type === 'LISTING') return { ...item, PK: `LISTING#${item.id}`, SK: 'DETAILS' };
  if (type === 'NOTICE')
    return { ...data, PK: `USER#${item.userId}`, SK: `NOTICE#${sort}` };
  if (type === 'REVIEW')
    return {
      ...data,
      PK: `TRANSACTION#${item.transactionId}`,
      SK: `REVIEWER#${item.reviewerId}`,
      reviewedPK: `USER#${item.reviewedUserId}`,
      reviewedSK: sort,
    };
  const record = { ...data, PK: `${type}#${item.id}`, SK: 'DETAILS' };
  if (type === 'OFFER' || type === 'PURCHASE')
    Object.assign(record, {
      buyerPK: `USER#${item.buyerId}`,
      buyerSK: sort,
      sellerPK: `USER#${item.sellerId}`,
      sellerSK: sort,
    });
  if (type === 'OFFER')
    Object.assign(record, { listingPK: `LISTING#${item.listingId}`, listingSK: sort });
  if (type === 'WALLET')
    Object.assign(record, { userPK: `USER#${item.userId}`, userSK: sort });
  return record;
}
export const historyItem = (offerId, h, position) => ({
  ...h,
  PK: `OFFER#${offerId}`,
  SK: `HISTORY#${String(position).padStart(10, '0')}#${h.id}`,
});

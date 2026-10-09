import { verifyToken } from '../lib/jwt.js';
import { fail, publicUser } from '../lib/validation.js';
export function createContext(store, images) {
  async function safe(user, publicOnly = false) {
    const fields = publicOnly ? ['id', 'name', 'profileImage', 'state', 'city', 'createdAt', 'averageRating', 'totalReviews', 'completedTransactions'] : Object.keys(publicUser);
    return { ...Object.fromEntries(fields.map(key => [key, user[key]])), profileImage: await images.url(user.profileImage) };
  }
  async function auth(req, _res, next) {
    let claims;
    try { claims = verifyToken(req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] || ''); }
    catch { fail('Please log in to continue.', 401); }
    const user = await store.user(claims.sub);
    if (!user || user.tokenVersion !== claims.version) fail('Your session has expired. Please log in again.', 401);
    req.user = user;
    next();
  }
  function member(req, _res, next) { if (req.user.role !== 'USER') fail('A member account is required.', 403); next(); }
  async function serialize(item) {
    const seller = await store.user(item.sellerId);
    const { PK, SK, sellerPK, sellerSK, statusPK, statusSK, ...listing } = item;
    return { ...listing, price: item.price / 100,
      images: await Promise.all((item.images || []).map(async (key, position) => ({ id: key, key, position, url: await images.url(key) }))),
      seller: seller ? await safe(seller, true) : { id: item.sellerId, name: 'Unavailable seller', profileImage: null, averageRating: 0, totalReviews: 0 },
    };
  }
  async function owned(req) {
    const listing = await store.listing(req.params.id);
    if (!listing || !listing.id) fail('Listing not found.', 404);
    if (listing.sellerId !== req.user.id) fail('Only the owner can change this listing.', 403);
    return listing;
  }
  return { store, images, safe, auth, member, serialize, owned };
}

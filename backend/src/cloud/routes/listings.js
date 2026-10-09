import { randomUUID } from 'node:crypto';
import { hashPassword, checkPassword } from '../../lib/password.js';
import { signToken } from '../../lib/jwt.js';
import { fail, profileValues, emailValue, passwordValue } from '../../lib/validation.js';
import { listingValues, listingQuery, editableStatuses, withdrawableStatuses } from '../../lib/listings.js';
export function register(app, { store, images, safe, auth, member, serialize, owned }) {
  app.get('/api/listings', async (req, res) => {
    const { where, orderBy, page, take, skip } = listingQuery(req.query);
    // Preserve the existing numbered-page UI for the small coursework catalogue.
    // Query the status index with pagination; never Scan the entire table.
    const candidates = await store.listings();
    const rows = candidates.filter(item => item.id && item.status === 'ACTIVE').filter(item => Object.entries(where).every(([key, value]) => {
      if (typeof value !== 'object') return item[key] === value;
      if (value.contains !== undefined) return String(item[key]).toLowerCase().includes(value.contains.toLowerCase());
      return (value.gte === undefined || item[key] >= value.gte) && (value.lte === undefined || item[key] <= value.lte);
    }));
    rows.sort((a, b) => {
      for (const sort of orderBy) {
        const [key, direction] = Object.entries(sort)[0];
        const difference = typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]));
        if (difference) return direction === 'asc' ? difference : -difference;
      }
      return 0;
    });
    res.json({ listings: await Promise.all(rows.slice(skip, skip + take).map(serialize)), total: rows.length, page, pages: Math.ceil(rows.length / take) });
  });
  app.get('/api/listings/mine', auth, async (req, res) => res.json({ listings: await Promise.all((await store.listings(req.user.id)).filter(item => item.id).map(serialize)) }));
  app.post('/api/listings', auth, member, async (req, res) => {
    const values = listingValues(req.body || {});
    const refs = await images.finalize(req.user.id, req.body.images || []);
    const id = randomUUID(), now = new Date().toISOString();
    const item = { ...values, id, sellerId: req.user.id, images: refs, status: 'ACTIVE', version: 0, createdAt: now, updatedAt: now,
      sellerPK: `USER#${req.user.id}`, sellerSK: `${now}#${id}`, statusPK: 'STATUS#ACTIVE', statusSK: `${now}#${id}` };
    await store.saveListing(item);
    res.status(201).json({ listing: await serialize(item) });
  });
  app.get('/api/listings/:id', async (req, res, next) => {
    const listing = await store.listing(req.params.id);
    if (!listing || !listing.id) fail('Listing not found.', 404);
    if (listing.status !== 'ACTIVE') {
      await auth(req, res, () => {});
      if (listing.sellerId !== req.user.id) fail('Listing not found.', 404);
    }
    res.json({ listing: await serialize(listing) });
  });
  const update = async (req, res) => {
    const old = await owned(req);
    if (!editableStatuses.includes(old.status)) fail('This listing cannot be edited.', 409);
    if (req.body?.updatedAt !== old.updatedAt) fail('This listing changed. Refresh it before editing again.', 409);
    const values = listingValues(req.body || {});
    const refs = await images.finalize(req.user.id, req.body.images, old.images || []);
    const status = old.status === 'NEEDS_REVISION' ? 'UNDER_REVIEW' : 'ACTIVE';
    const next = { ...old, ...values, images: refs, status, statusPK: `STATUS#${status}`, version: old.version + 1,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(old.updatedAt) + 1)).toISOString() };
    await store.saveListing(next, old);
    res.json({ listing: await serialize(next) });
  };
  app.put('/api/listings/:id', auth, member, update);
  app.patch('/api/listings/:id', auth, member, update);
  const withdraw = async (req, res) => {
    const old = await owned(req);
    if (!withdrawableStatuses.includes(old.status)) fail('This listing cannot be withdrawn.', 409);
    await store.saveListing({ ...old, status: 'WITHDRAWN', statusPK: 'STATUS#WITHDRAWN', version: old.version + 1,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(old.updatedAt) + 1)).toISOString() }, old);
    res.json({ message: 'Listing withdrawn.' });
  };
  app.delete('/api/listings/:id', auth, member, withdraw);
  app.post('/api/listings/:id/withdraw', auth, member, withdraw);
}

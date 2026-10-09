import { randomUUID } from 'node:crypto';
import { hashPassword, checkPassword } from '../../lib/password.js';
import { signToken } from '../../lib/jwt.js';
import { fail, profileValues, emailValue, passwordValue } from '../../lib/validation.js';
import { listingValues, listingQuery, editableStatuses, withdrawableStatuses } from '../../lib/listings.js';
export function register(app, { store, images, safe, auth, member, serialize, owned }) {
  app.get('/api/favourites', auth, member, async (req, res) => {
    const saved = await store.favourites(req.user.id);
    const listings = await Promise.all(saved.map(item => store.listing(item.listingId)));
    res.json({ listings: await Promise.all(listings.filter(item => item?.id && item.status === 'ACTIVE').map(serialize)) });
  });
  app.get('/api/favourites/:id', auth, member, async (req, res) => res.json({ favourite: !!await store.favourite(req.user.id, req.params.id) }));
  for (const method of ['put', 'delete']) app[method]('/api/favourites/:id', auth, member, async (req, res) => {
    await store.setFavourite(req.user.id, req.params.id, method === 'put');
    res.json({ favourite: method === 'put' });
  });
}

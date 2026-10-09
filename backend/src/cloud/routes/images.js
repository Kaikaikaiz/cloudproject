import { randomUUID } from 'node:crypto';
import { hashPassword, checkPassword } from '../../lib/password.js';
import { signToken } from '../../lib/jwt.js';
import { fail, profileValues, emailValue, passwordValue } from '../../lib/validation.js';
import { listingValues, listingQuery, editableStatuses, withdrawableStatuses } from '../../lib/listings.js';
export function register(app, { store, images, safe, auth, member, serialize, owned }) {
  app.post('/api/uploads', auth, async (req, res) => res.json(await images.upload(req.user.id, req.body || {})));
}

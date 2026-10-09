import { pagination } from '../pagination.js';
import { createCommerce } from '../commerce.js';
export function register(app, context) {
  const { auth, member } = context,
    service = createCommerce(context);
  app.use('/api/offers', auth, member);
  app.get('/api/offers', async (req, res) =>
    res.json(
      await service.offersPage(
        req.user.id,
        req.query.direction,
        pagination(req.query, req.user.id, 'offers:' + (req.query.direction || 'made')),
      ),
    ),
  );
  app.post('/api/offers', async (req, res) =>
    res.status(201).json({ offer: await service.makeOffer(req.user.id, req.body || {}) }),
  );
  app.get('/api/offers/:id', async (req, res) =>
    res.json({ offer: await service.offer(req.user.id, req.params.id) }),
  );
  app.post('/api/offers/:id/actions', async (req, res) =>
    res.json({ offer: await service.act(req.user.id, req.params.id, req.body || {}) }),
  );
}

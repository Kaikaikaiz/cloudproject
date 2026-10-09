import { pagination } from '../pagination.js';
import { createCommerce } from '../commerce.js';
export function register(app, context) {
  const { auth, member } = context,
    service = createCommerce(context);
  app.use(['/api/wallet', '/api/purchases', '/api/transactions'], auth, member);
  app.get('/api/wallet', async (req, res) =>
    res.json(
      await service.walletPage(req.user.id, pagination(req.query, req.user.id, 'wallet')),
    ),
  );
  app.post('/api/wallet/top-ups', async (req, res) => {
    const result = await service.createTopUp(req.user.id, req.body || {});
    res.status(result.created ? 201 : 200).json({ topUp: result.topUp });
  });
  app.get('/api/wallet/top-ups/:id', async (req, res) =>
    res.json({ topUp: await service.topUp(req.user.id, req.params.id) }),
  );
  for (const action of ['confirm', 'cancel'])
    app.post(`/api/wallet/top-ups/:id/${action}`, async (req, res) =>
      res.json({ topUp: await service.settleTopUp(req.user.id, req.params.id, action) }),
    );
  app.get('/api/purchases/quote', async (req, res) =>
    res.json({
      checkout: await service.quote(req.user.id, req.query.listingId, req.query.offerId),
    }),
  );
  app.post('/api/purchases', async (req, res) => {
    const result = await service.buy(req.user.id, req.body || {});
    res.status(result.created ? 201 : 200).json({ purchase: result.purchase });
  });
  app.get('/api/purchases/:id', async (req, res) =>
    res.json({ purchase: await service.purchase(req.user.id, req.params.id) }),
  );
  app.get('/api/transactions', async (req, res) =>
    res.json(
      await service.transactionsPage(
        req.user.id,
        req.query.direction,
        pagination(
          req.query,
          req.user.id,
          'transactions:' + (req.query.direction || 'purchases'),
        ),
      ),
    ),
  );
  app.get('/api/transactions/:id', async (req, res) =>
    res.json({ transaction: await service.transaction(req.user.id, req.params.id) }),
  );
  app.post('/api/transactions/:id/reviews', async (req, res) =>
    res
      .status(201)
      .json({ review: await service.review(req.user.id, req.params.id, req.body || {}) }),
  );
}

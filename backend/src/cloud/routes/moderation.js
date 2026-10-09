import { createModeration } from '../moderation.js';
import { fail } from '../../lib/validation.js';
export function register(app, context) {
  const service = createModeration(context),
    { auth } = context;
  app.post('/api/reports', auth, async (req, res) =>
    res.status(201).json({ report: await service.submit(req.user, req.body || {}) }),
  );
  app.use('/api/admin', auth, (req, _res, next) => {
    if (req.user.role !== 'ADMIN') fail('Administrator access required.', 403);
    next();
  });
  app.get('/api/admin/reports', async (req, res) =>
    res.json(await service.list(req.query.group)),
  );
  app.get('/api/admin/reports/:id', async (req, res) =>
    res.json({ report: await service.get(req.params.id) }),
  );
  app.post('/api/admin/reports/:id/actions', async (req, res) =>
    res.json({ report: await service.act(req.params.id, req.body || {}) }),
  );
}

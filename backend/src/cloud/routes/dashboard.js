import { createCommerce } from '../commerce.js';
import { pagination } from '../pagination.js';
export function register(app, context) {
  const { auth, member } = context,
    service = createCommerce(context);
  app.use('/api/dashboard', auth, member);
  app.get('/api/dashboard', async (req, res) =>
    res.json(
      await service.dashboard(
        req.user.id,
        pagination(req.query, req.user.id, 'notifications'),
      ),
    ),
  );
  app.post('/api/dashboard/notifications/read', async (req, res) => {
    await service.readNotifications(req.user.id);
    res.json({ message: 'Notifications marked as read.' });
  });
}

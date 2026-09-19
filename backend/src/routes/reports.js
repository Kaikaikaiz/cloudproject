import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { fail } from '../lib/validation.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
export const reportReasons = [
  'Scam / Fraud',
  'Inappropriate Content',
  'Prohibited Item',
  'Misleading Information',
  'Duplicate Listing',
  'Other',
];

router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'USER') {
    fail('The administrator reviews reports; only members can submit them.', 403);
  }

  const { listingId, reason, description = '' } = req.body || {};
  if (typeof listingId !== 'string' || !reportReasons.includes(reason)) {
    fail('Choose a listing and a valid report reason.');
  }
  if (typeof description !== 'string' || description.trim().length > 2000) {
    fail('Report description must be 2,000 characters or fewer.');
  }

  const report = await prisma.$transaction(async (database) => {
    const listing = await database.listing.findUnique({ where: { id: listingId } });
    if (!listing) fail('Listing not found.', 404);
    if (listing.sellerId === req.user.id)
      fail('You cannot report your own listing.', 403);

    const existing = await database.report.findFirst({
      where: {
        listingId,
        reporterId: req.user.id,
        status: { in: ['PENDING', 'REVIEWING'] },
      },
    });
    if (existing) fail('You already have an active report for this listing.', 409);
    if (listing.status !== 'ACTIVE')
      fail('This listing is no longer publicly available to report.', 409);

    return database.report.create({
      data: {
        listingId,
        reporterId: req.user.id,
        reason,
        description: description.trim() || null,
      },
    });
  });

  res.status(201).json({ report });
});

router.use((error, _req, res, next) => {
  if (['P2002', 'P2034', 'P1008', 'P2028'].includes(error.code)) {
    return res.status(409).json({
      error:
        'This report is already being submitted or the listing changed. Refresh before trying again.',
    });
  }
  next(error);
});

export default router;

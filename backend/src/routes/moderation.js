import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
import { fail } from '../lib/validation.js';
import { listingInclude, serializeListing } from '../lib/listings.js';
import { closeOpenOffers } from '../lib/offers.js';
import { notify } from '../lib/notifications.js';

const router = Router();
const openStatuses = ['PENDING', 'REVIEWING'];
const reportInclude = {
  listing: { include: listingInclude },
  reporter: { select: { id: true, name: true } },
};

function serializeReport(report) {
  return { ...report, listing: serializeListing(report.listing) };
}

router.use(requireAuth, requireAdmin);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (req, res) => {
  const group = req.query.group || 'pending';
  const statuses = {
    pending: ['PENDING'],
    reviewing: ['REVIEWING'],
    resolved: ['ACTION_TAKEN', 'REJECTED'],
  };
  if (!statuses[group]) fail('Choose a valid report group.');

  const [reports, counts] = await prisma.$transaction([
    prisma.report.findMany({
      where: { status: { in: statuses[group] } },
      include: reportInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.report.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const count = (status) =>
    counts.find((item) => item.status === status)?._count._all || 0;
  res.json({
    reports: reports.map(serializeReport),
    counts: {
      pending: count('PENDING'),
      reviewing: count('REVIEWING'),
      resolved: count('ACTION_TAKEN') + count('REJECTED'),
    },
  });
});

router.get('/:id', async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: reportInclude,
  });
  if (!report) fail('Report not found.', 404);
  res.json({ report: serializeReport(report) });
});

router.post('/:id/actions', async (req, res) => {
  const { action, version, listingUpdatedAt, adminReason = '' } = req.body || {};
  if (
    !['investigate', 'dismiss', 'revision', 'remove', 'restore', 'approve'].includes(
      action,
    )
  ) {
    fail('Choose a valid moderation action.');
  }
  if (!Number.isInteger(version) || typeof listingUpdatedAt !== 'string')
    fail('Refresh the report before acting.');
  if (
    typeof adminReason !== 'string' ||
    adminReason.trim().length > 2000 ||
    (action !== 'investigate' && !adminReason.trim())
  ) {
    fail('Enter an admin reason of 1–2,000 characters.');
  }

  const report = await prisma.$transaction(async (database) => {
    const current = await database.report.findUnique({
      where: { id: req.params.id },
      include: reportInclude,
    });
    if (!current) fail('Report not found.', 404);
    const listing = current.listing;
    if (
      current.version !== version ||
      listing.updatedAt.toISOString() !== listingUpdatedAt
    ) {
      fail('This report or listing changed. Refresh before acting.', 409);
    }

    const isOpen = openStatuses.includes(current.status);
    if (!isOpen && action !== 'restore')
      fail('This report has already been resolved.', 409);
    let listingStatus = listing.status;
    let previousStatus = listing.moderationPreviousStatus;
    let reportStatus = 'REVIEWING';

    if (action === 'investigate') {
      if (current.status !== 'PENDING') fail('This report is already under review.', 409);
      if (listing.status === 'ACTIVE') {
        previousStatus = 'ACTIVE';
        listingStatus = 'UNDER_REVIEW';
      }
    } else if (action === 'revision') {
      if (!['ACTIVE', 'UNDER_REVIEW', 'NEEDS_REVISION'].includes(listing.status)) {
        fail('Only unsold, unreserved listings can be revised.', 409);
      }
      previousStatus ||= 'ACTIVE';
      listingStatus = 'NEEDS_REVISION';
    } else if (action === 'remove') {
      if (listing.status === 'REMOVED') fail('This listing is already removed.', 409);
      previousStatus ||= listing.status;
      listingStatus = 'REMOVED';
      reportStatus = 'ACTION_TAKEN';
    } else if (action === 'restore' || action === 'approve') {
      if (action === 'restore' && listing.status !== 'REMOVED')
        fail('Only removed listings can be restored.', 409);
      if (action === 'approve' && listing.status !== 'UNDER_REVIEW')
        fail('Only listings under review can be approved.', 409);
      // Never make an already sold, reserved or withdrawn item purchasable again.
      listingStatus = ['SOLD', 'RESERVED', 'WITHDRAWN'].includes(previousStatus)
        ? previousStatus
        : 'ACTIVE';
      previousStatus = null;
      reportStatus = 'ACTION_TAKEN';
    } else if (action === 'dismiss') {
      if (['UNDER_REVIEW', 'NEEDS_REVISION'].includes(listing.status)) {
        listingStatus = previousStatus || 'ACTIVE';
        previousStatus = null;
      }
      reportStatus = 'REJECTED';
    }

    const changed = await database.listing.updateMany({
      where: { id: listing.id, updatedAt: listing.updatedAt, status: listing.status },
      data: {
        status: listingStatus,
        moderationPreviousStatus: previousStatus,
        moderationReason:
          action === 'investigate' ? listing.moderationReason : adminReason.trim(),
      },
    });
    if (changed.count !== 1) fail('The listing changed. Refresh before acting.', 409);

    if (['UNDER_REVIEW', 'NEEDS_REVISION', 'REMOVED'].includes(listingStatus)) {
      await closeOpenOffers(database, listing.id, req.user.id, 'LISTING_MODERATED');
    }

    if (action === 'revision') {
      await notify(database, listing.sellerId, 'LISTING_NEEDS_REVISION', `Your listing “${listing.title}” requires revision.`, '/listing/' + listing.id + '/edit');
    }

    // One listing decision resolves its open reports together, avoiding conflicting queues.
    await database.report.updateMany({
      where: {
        listingId: listing.id,
        OR: [{ status: { in: openStatuses } }, { id: current.id }],
      },
      data: {
        status: reportStatus,
        adminReason: adminReason.trim() || null,
        reviewedAt: openStatuses.includes(reportStatus) ? null : new Date(),
        version: { increment: 1 },
      },
    });
    return database.report.findUnique({
      where: { id: current.id },
      include: reportInclude,
    });
  });

  res.json({ report: serializeReport(report) });
});

router.use((error, _req, res, next) => {
  if (['P2002', 'P2034', 'P1008', 'P2028'].includes(error.code)) {
    return res
      .status(409)
      .json({ error: 'The report or listing changed. Refresh before trying again.' });
  }
  next(error);
});

export default router;

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { fail } from '../lib/validation.js';
import {
  listingValues,
  listingQuery,
  listingInclude,
  serializeListing,
  editableStatuses,
  withdrawableStatuses,
} from '../lib/listings.js';
import { validateImages, saveImages, removeImages } from '../lib/listingImages.js';
const router = Router();
async function owned(id, userId) {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: listingInclude,
  });
  if (!listing) fail('Listing not found.', 404);
  if (listing.sellerId !== userId) fail('Only the owner can change this listing.', 403);
  return listing;
}
router.get('/', async (req, res) => {
  const { where, orderBy, page, take, skip } = listingQuery(req.query);
  const [total, listings] = await prisma.$transaction([
    prisma.listing.count({ where }),
    prisma.listing.findMany({ where, orderBy, take, skip, include: listingInclude }),
  ]);
  res.json({
    listings: listings.map(serializeListing),
    total,
    page,
    pages: Math.ceil(total / take),
  });
});
router.get('/mine', requireAuth, async (req, res) => {
  const listings = await prisma.listing.findMany({
    where: { sellerId: req.user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: listingInclude,
  });
  res.json({ listings: listings.map(serializeListing) });
});
router.post('/', requireAuth, async (req, res) => {
  const values = listingValues(req.body || {});
  const images = validateImages(req.body.images ?? []);
  const saved = await saveImages(images);
  try {
    const listing = await prisma.listing.create({
      data: {
        ...values,
        sellerId: req.user.id,
        images: { create: saved.urls.map((url, position) => ({ url, position })) },
      },
      include: listingInclude,
    });
    res.status(201).json({ listing: serializeListing(listing) });
  } catch (error) {
    await removeImages(saved.added);
    throw error;
  }
});
router.get('/:id', async (req, res, next) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: listingInclude,
  });
  if (!listing) fail('Listing not found.', 404);
  if (listing.status === 'ACTIVE')
    return res.json({ listing: serializeListing(listing) });
  return requireAuth(req, res, (error) => {
    if (error) return next(error);
    if (req.user.id !== listing.sellerId)
      return res.status(404).json({ error: 'This listing is no longer available.' });
    res.json({ listing: serializeListing(listing) });
  });
});
router.patch('/:id', requireAuth, async (req, res) => {
  const old = await owned(req.params.id, req.user.id);
  if (!editableStatuses.includes(old.status))
    fail('Only ACTIVE or NEEDS_REVISION listings can be edited.', 409);
  const values = listingValues(req.body || {});
  if (req.body.updatedAt !== old.updatedAt.toISOString())
    fail('This listing changed. Refresh it before editing again.', 409);
  const images = validateImages(
    req.body.images,
    old.images.map((image) => image.url),
  );
  const saved = await saveImages(images);
  let listing;
  try {
    listing = await prisma.$transaction(async (tx) => {
      const changed = await tx.listing.updateMany({
        where: {
          id: old.id,
          sellerId: req.user.id,
          status: old.status,
          updatedAt: old.updatedAt,
        },
        data: {
          ...values,
          status: old.status === 'NEEDS_REVISION' ? 'UNDER_REVIEW' : 'ACTIVE',
        },
      });
      if (!changed.count)
        fail('This listing changed. Refresh it before editing again.', 409);
      await tx.listingImage.deleteMany({ where: { listingId: old.id } });
      await tx.listingImage.createMany({
        data: saved.urls.map((url, position) => ({ url, position, listingId: old.id })),
      });
      return tx.listing.findUnique({ where: { id: old.id }, include: listingInclude });
    });
  } catch (error) {
    await removeImages(saved.added);
    throw error;
  }
  await removeImages(
    old.images.map((image) => image.url).filter((url) => !saved.urls.includes(url)),
  );
  res.json({ listing: serializeListing(listing) });
});
router.post('/:id/withdraw', requireAuth, async (req, res) => {
  const listing = await owned(req.params.id, req.user.id);
  if (!withdrawableStatuses.includes(listing.status))
    fail('This listing cannot be withdrawn in its current status.', 409);
  const changed = await prisma.listing.updateMany({
    where: {
      id: listing.id,
      sellerId: req.user.id,
      status: { in: withdrawableStatuses },
    },
    data: { status: 'WITHDRAWN' },
  });
  if (!changed.count) fail('This listing changed. Refresh and try again.', 409);
  res.json({ message: 'Listing withdrawn.' });
});
export default router;

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { fail } from '../lib/validation.js';
import { listingInclude, serializeListing } from '../lib/listings.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
  const saved = await prisma.favourite.findMany({
    where: { userId: req.user.id, listing: { status: 'ACTIVE' } },
    include: { listing: { include: listingInclude } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ listings: saved.map((item) => serializeListing(item.listing)) });
});
router.get('/:id', async (req, res) => {
  const saved = await prisma.favourite.findUnique({
    where: { userId_listingId: { userId: req.user.id, listingId: req.params.id } },
  });
  res.json({ favourite: !!saved });
});
router.put('/:id', async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.status !== 'ACTIVE')
      fail('This listing is no longer available.', 404);
    if (listing.sellerId === req.user.id)
      fail('You cannot favourite your own listing.', 403);
    await tx.favourite.upsert({
      where: { userId_listingId: { userId: req.user.id, listingId: listing.id } },
      create: { userId: req.user.id, listingId: listing.id },
      update: {},
    });
  });
  res.json({ favourite: true });
});
router.delete('/:id', async (req, res) => {
  await prisma.favourite.deleteMany({
    where: { userId: req.user.id, listingId: req.params.id },
  });
  res.json({ favourite: false });
});
export default router;

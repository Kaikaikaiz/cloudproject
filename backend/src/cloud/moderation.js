import { randomUUID, createHash } from 'node:crypto';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { fail } from '../lib/validation.js';
import { layout } from './table-layout.js';
const reasons = [
  'Scam / Fraud',
  'Inappropriate Content',
  'Prohibited Item',
  'Misleading Information',
  'Duplicate Listing',
  'Other',
];
const open = (status) => ['PENDING', 'REVIEWING'].includes(status);
const next = (old, values) => ({
  ...old,
  ...values,
  version: old.version + 1,
  updatedAt: new Date(
    Math.max(Date.now(), Date.parse(old.updatedAt || old.createdAt) + 1),
  ).toISOString(),
});
export function createModerationStore(
  client,
  { reports = process.env.REPORTS_TABLE || 'relive-reports', listings, notifications },
) {
  const key = (id) => ({ PK: `REPORT#${id}`, SK: 'DETAILS' });
  const put = (TableName, Item, old) => ({
    Put: {
      TableName,
      Item,
      ConditionExpression: old ? '#v = :v' : 'attribute_not_exists(PK)',
      ...(old
        ? {
            ExpressionAttributeNames: { '#v': 'version' },
            ExpressionAttributeValues: { ':v': old.version },
          }
        : {}),
    },
  });
  const indexed = (r) => ({
    ...r,
    ...key(r.id),
    statusPK: `STATUS#${r.status}`,
    statusSK: `${r.createdAt}#${r.id}`,
  });
  async function query(input) {
    let cursor;
    const items = [];
    do {
      const p = await client.send(
        new QueryCommand({ ...input, ExclusiveStartKey: cursor }),
      );
      items.push(...(p.Items || []));
      cursor = p.LastEvaluatedKey;
    } while (cursor);
    return items;
  }
  return {
    async get(id) {
      return (
        await client.send(
          new GetCommand({ TableName: reports, Key: key(id), ConsistentRead: true }),
        )
      ).Item;
    },
    async list(status) {
      return query({
        TableName: reports,
        IndexName: 'StatusIndex',
        KeyConditionExpression: 'statusPK = :pk',
        ExpressionAttributeValues: { ':pk': `STATUS#${status}` },
        ScanIndexForward: false,
      });
    },
    async forListing(id) {
      const pointers = await query({
        TableName: reports,
        ConsistentRead: true,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `LISTING#${id}` },
      });
      return (await Promise.all(pointers.map((p) => this.get(p.id)))).filter(Boolean);
    },
    async save({ records, listing, oldListing, notice, create = false }) {
      const writes = records.map(({ item, old }) => put(reports, indexed(item), old));
      writes.push(put(listings, layout('LISTING', listing), oldListing));
      if (create) {
        const r = records[0].item;
        writes.push(
          put(reports, { PK: `LISTING#${r.listingId}`, SK: `REPORT#${r.id}`, id: r.id }),
        );
      }
      if (notice) writes.push(put(notifications, layout('NOTICE', notice)));
      if (writes.length > 100)
        fail(
          'Too many reports for one atomic moderation action. Administrator assistance is required.',
          409,
        );
      await client.send(new TransactWriteCommand({ TransactItems: writes }));
    },
  };
}
export function createModeration({ store, serialize }) {
  const db = store.moderation;
  async function view(report) {
    if (!report) fail('Report not found.', 404);
    const listing = await store.listing(report.listingId),
      reporter = await store.user(report.reporterId);
    const { PK, SK, statusPK, statusSK, ...result } = report;
    return {
      ...result,
      listing: await serialize(listing),
      reporter: { id: report.reporterId, name: reporter?.name || 'Unavailable user' },
    };
  }
  return {
    async submit(user, body) {
      if (user.role !== 'USER') fail('Only members can submit reports.', 403);
      const { listingId, reason, description = '' } = body;
      if (typeof listingId !== 'string' || !reasons.includes(reason))
        fail('Choose a listing and a valid report reason.');
      if (typeof description !== 'string' || description.trim().length > 2000)
        fail('Report description must be at most 2,000 characters.');
      const listing = await store.listing(listingId);
      if (!listing?.id) fail('Listing not found.', 404);
      if (listing.sellerId === user.id) fail('You cannot report your own listing.', 403);
      if (listing.status !== 'ACTIVE')
        fail('This listing is no longer publicly available to report.', 409);
      const id = createHash('sha256')
          .update(JSON.stringify([listingId, user.id]))
          .digest('hex'),
        old = await db.get(id);
      if (old && open(old.status))
        fail('You already have an active report for this listing.', 409);
      const item = {
        id,
        listingId,
        reporterId: user.id,
        reason,
        description: description.trim() || null,
        status: 'PENDING',
        version: old ? old.version + 1 : 0,
        createdAt: new Date().toISOString(),
        adminReason: null,
        reviewedAt: null,
      };
      await db.save({
        records: [{ item, old }],
        listing: next(listing, {}),
        oldListing: listing,
        create: !old,
      });
      return item;
    },
    async list(group = 'pending') {
      const groups = {
        pending: ['PENDING'],
        reviewing: ['REVIEWING'],
        resolved: ['ACTION_TAKEN', 'REJECTED'],
      };
      if (!groups[group]) fail('Choose a valid report group.');
      const statuses = ['PENDING', 'REVIEWING', 'ACTION_TAKEN', 'REJECTED'],
        rows = await Promise.all(statuses.map((s) => db.list(s)));
      return {
        reports: await Promise.all(
          rows
            .flat()
            .filter((r) => groups[group].includes(r.status))
            .map(view),
        ),
        counts: {
          pending: rows[0].length,
          reviewing: rows[1].length,
          resolved: rows[2].length + rows[3].length,
        },
      };
    },
    async get(id) {
      return view(await db.get(id));
    },
    async act(id, body) {
      const { action, version, listingUpdatedAt, adminReason = '' } = body;
      if (
        !['investigate', 'dismiss', 'revision', 'remove', 'restore', 'approve'].includes(
          action,
        )
      )
        fail('Choose a valid moderation action.');
      if (!Number.isInteger(version) || typeof listingUpdatedAt !== 'string')
        fail('Refresh the report before acting.');
      if (
        typeof adminReason !== 'string' ||
        adminReason.trim().length > 2000 ||
        (action !== 'investigate' && !adminReason.trim())
      )
        fail('Enter an admin reason of 1–2,000 characters.');
      const current = await db.get(id);
      if (!current) fail('Report not found.', 404);
      const listing = await store.listing(current.listingId);
      if (current.version !== version || listing.updatedAt !== listingUpdatedAt)
        fail('Report or listing changed. Refresh before acting.', 409);
      if (!open(current.status) && action !== 'restore')
        fail('This report is already resolved.', 409);
      let status = listing.status,
        previous = listing.moderationPreviousStatus || null,
        reportStatus = 'REVIEWING';
      if (action === 'investigate') {
        if (current.status !== 'PENDING') fail('Already under review.', 409);
        if (status === 'ACTIVE') {
          previous = 'ACTIVE';
          status = 'UNDER_REVIEW';
        }
      }
      if (action === 'revision') {
        if (!['ACTIVE', 'UNDER_REVIEW', 'NEEDS_REVISION'].includes(status))
          fail('Only unsold, unreserved listings can be revised.', 409);
        previous ||= 'ACTIVE';
        status = 'NEEDS_REVISION';
      }
      if (action === 'remove') {
        if (status === 'REMOVED') fail('Already removed.', 409);
        previous ||= status;
        status = 'REMOVED';
        reportStatus = 'ACTION_TAKEN';
      }
      if (action === 'restore' || action === 'approve') {
        if (status !== (action === 'restore' ? 'REMOVED' : 'UNDER_REVIEW'))
          fail('Listing is not eligible for this action.', 409);
        status = ['SOLD', 'RESERVED', 'WITHDRAWN'].includes(previous)
          ? previous
          : 'ACTIVE';
        previous = null;
        reportStatus = 'ACTION_TAKEN';
      }
      if (action === 'dismiss') {
        if (['UNDER_REVIEW', 'NEEDS_REVISION'].includes(status)) {
          status = previous || 'ACTIVE';
          previous = null;
        }
        reportStatus = 'REJECTED';
      }
      const related = await db.forListing(listing.id);
      const records = related
        .filter((r) => open(r.status) || r.id === id)
        .map((r) => ({
          old: r,
          item: next(r, {
            status: reportStatus,
            adminReason: adminReason.trim() || null,
            reviewedAt: open(reportStatus) ? null : new Date().toISOString(),
          }),
        }));
      const updated = next(listing, {
        ...(['UNDER_REVIEW', 'NEEDS_REVISION', 'REMOVED'].includes(status)
          ? { moderationClosedAt: new Date().toISOString() }
          : {}),
        status,
        statusPK: `STATUS#${status}`,
        moderationPreviousStatus: previous,
        moderationReason:
          action === 'investigate' ? listing.moderationReason : adminReason.trim(),
      });
      const notice =
        action === 'revision'
          ? {
              id: randomUUID(),
              userId: listing.sellerId,
              message: `Your listing “${listing.title}” requires revision.`,
              link: `/listing/${listing.id}/edit`,
              readAt: null,
              version: 0,
              createdAt: new Date().toISOString(),
            }
          : null;
      await db.save({ records, listing: updated, oldListing: listing, notice });
      return view(records.find((r) => r.item.id === id).item);
    },
  };
}

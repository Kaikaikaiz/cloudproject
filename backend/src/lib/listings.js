import { fail, states } from './validation.js';
export const categories = [
  'Electronics',
  'Fashion',
  'Home & Living',
  'Sports & Hobbies',
  'Books & Education',
  'Others',
];
export const conditions = ['Like New', 'Good', 'Fair', 'Well Used'];
export const statuses = [
  'ACTIVE',
  'RESERVED',
  'SOLD',
  'WITHDRAWN',
  'UNDER_REVIEW',
  'NEEDS_REVISION',
  'REMOVED',
];
export const editableStatuses = ['ACTIVE', 'NEEDS_REVISION'];
export const withdrawableStatuses = ['ACTIVE', 'NEEDS_REVISION', 'UNDER_REVIEW'];
export const listingInclude = {
  images: { orderBy: { position: 'asc' } },
  seller: {
    select: {
      id: true,
      name: true,
      profileImage: true,
      state: true,
      city: true,
      averageRating: true,
      totalReviews: true,
      completedTransactions: true,
      createdAt: true,
    },
  },
};
export function serializeListing(listing) {
  return { ...listing, price: listing.price / 100 };
}
export function money(value, field = 'Price') {
  if (
    !['string', 'number'].includes(typeof value) ||
    !/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/.test(String(value))
  )
    fail(
      field + ' must be between RM 0 and RM 999,999.99, with up to two decimal places.',
    );
  return Math.round(Number(value) * 100);
}
function text(value, name, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    fail(name + ' must contain ' + min + '–' + max + ' characters.');
  return value.trim();
}
export function listingValues(body) {
  if ('status' in body || 'sellerId' in body || 'id' in body)
    fail('Listing ownership and status cannot be set directly.');
  const title = text(body.title, 'Title', 2, 120);
  const description = text(body.description, 'Description', 10, 5000);
  const city = text(body.city, 'City / Area', 2, 80);
  if (!categories.includes(body.category)) fail('Choose a valid category.');
  if (!conditions.includes(body.condition)) fail('Choose a valid condition.');
  if (!states.includes(body.state))
    fail('Choose a Malaysian state or federal territory.');
  return {
    title,
    description,
    city,
    state: body.state,
    category: body.category,
    condition: body.condition,
    price: money(body.price),
  };
}
export function listingQuery(query) {
  const where = { status: 'ACTIVE' };
  for (const [field, choices] of [
    ['category', categories],
    ['condition', conditions],
    ['state', states],
  ]) {
    if (query[field]) {
      if (!choices.includes(query[field])) fail('Invalid ' + field + ' filter.');
      where[field] = query[field];
    }
  }
  if (query.search) where.title = { contains: text(query.search, 'Search', 1, 120) };
  if (query.city) where.city = { contains: text(query.city, 'City / Area', 1, 80) };
  if (query.minPrice !== undefined && query.minPrice !== '')
    where.price = { gte: money(query.minPrice, 'Minimum price') };
  if (query.maxPrice !== undefined && query.maxPrice !== '')
    where.price = { ...where.price, lte: money(query.maxPrice, 'Maximum price') };
  if (where.price?.gte > where.price?.lte)
    fail('Minimum price cannot be greater than maximum price.');
  const sorts = {
    newest: [{ createdAt: 'desc' }, { id: 'desc' }],
    price_asc: [{ price: 'asc' }, { id: 'desc' }],
    price_desc: [{ price: 'desc' }, { id: 'desc' }],
  };
  const sort = query.sort || 'newest';
  if (!Object.hasOwn(sorts, sort)) fail('Invalid sort order.');
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    fail('Invalid page number.');
  return { where, orderBy: sorts[sort], page, take: 12, skip: (page - 1) * 12 };
}

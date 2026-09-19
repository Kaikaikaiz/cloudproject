export const categories = [
  'Electronics',
  'Fashion',
  'Home & Living',
  'Sports & Hobbies',
  'Books & Education',
  'Others',
];
export const conditions = ['Like New', 'Good', 'Fair', 'Well Used'];
export const editableStatuses = ['ACTIVE', 'NEEDS_REVISION'];
export const withdrawableStatuses = ['ACTIVE', 'NEEDS_REVISION', 'UNDER_REVIEW'];
export const statusLabel = (status) =>
  status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const rm = (value) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
export const rating = (value) =>
  value > 0 ? value.toFixed(1) + ' / 5' : 'No ratings yet';

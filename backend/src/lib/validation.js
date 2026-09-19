export const states = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
];
export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export function emailValue(value) {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    fail('Enter a valid email address.');
  return value.trim().toLowerCase();
}
export function passwordValue(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128)
    fail('Password must contain 10–128 characters.');
  return value;
}
export function profileValues(body) {
  if (
    typeof body.name !== 'string' ||
    body.name.trim().length < 2 ||
    body.name.trim().length > 80
  )
    fail('Name must contain 2–80 characters.');
  const phone = body.phone ?? '';
  const state = body.state ?? '';
  const city = body.city ?? '';
  if (typeof phone !== 'string' || (phone && !/^\+?[\d ()-]{7,20}$/.test(phone)))
    fail('Enter a valid phone number (7–20 characters).');
  if (typeof state !== 'string' || (state && !states.includes(state)))
    fail('Choose a Malaysian state or federal territory.');
  if (typeof city !== 'string' || city.trim().length > 80)
    fail('City / Area must be 80 characters or fewer.');
  if (Boolean(state) !== Boolean(city.trim()))
    fail('Enter both State and City / Area, or leave both empty.');
  return {
    name: body.name.trim(),
    email: emailValue(body.email),
    phone: phone.trim(),
    state,
    city: city.trim(),
  };
}
export const publicUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  profileImage: true,
  state: true,
  city: true,
  averageRating: true,
  totalReviews: true,
  completedTransactions: true,
  createdAt: true,
  role: true,
};

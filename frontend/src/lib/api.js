// The one browser-to-API boundary. Keep VITE_API_URL for deployed environments.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);
export const CLOUD_MODE = import.meta.env.VITE_CLOUD_MODE === 'true';
export const imageUrl = (path) => (path ? new URL(path, API_URL).href : null);
const sessionToken = () => window.sessionStorage.getItem('relive_session_token');
export function setSessionToken(token) {
  if (token) window.sessionStorage.setItem('relive_session_token', token);
  else window.sessionStorage.removeItem('relive_session_token');
}
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API_URL + path, {
      ...options,
      credentials: CLOUD_MODE ? 'omit' : 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(import.meta.env.VITE_API_KEY ? { 'X-Api-Key': import.meta.env.VITE_API_KEY } : {}),
        ...(sessionToken() ? { Authorization: 'Bearer ' + sessionToken() } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    const error = new Error(
      'Could not reach reLIVE. Check that the API is running and that this frontend origin is allowed.',
    );
    error.code = 'NETWORK_OR_CORS';
    error.cause = cause;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    if (response.status === 401) {
      setSessionToken(null);
    }
    if (response.status === 401 && !['/auth/login', '/auth/me'].includes(path))
      window.dispatchEvent(new Event('relive:unauthorized'));
    throw error;
  }
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()))
    window.dispatchEvent(new CustomEvent('relive:data-changed', { detail: { path } }));
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()))
    window.dispatchEvent(new CustomEvent('relive:toast', { detail: { message: data.message || 'Saved successfully.' } }));
  return data;
}

export async function uploadCloudImage(dataUrl, purpose = 'listing') {
  if (!CLOUD_MODE) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  const upload = await api('/uploads', { method: 'POST', body: { contentType: blob.type, size: blob.size, purpose } });
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
  form.append('file', blob);
  const result = await fetch(upload.url, { method: 'POST', body: form });
  if (!result.ok) throw new Error('Image upload failed. Please try again.');
  return upload.reference;
}

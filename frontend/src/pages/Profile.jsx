import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, imageUrl } from '../lib/api';
import { readImageFile } from '../lib/readImageFile';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import LocationFields from '../components/LocationFields';
import Reputation from '../components/Reputation';
export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let isActive = true;
    api('/auth/me')
      .then((data) => {
        if (isActive) setUser(data.user);
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.message);
      });
    return () => {
      isActive = false;
    };
  }, [setUser]);
  function edit() {
    setValues({
      name: user.name,
      email: user.email,
      phone: user.phone,
      state: user.state,
      city: user.city,
    });
    setError('');
    setNotice('');
    setEditing(true);
  }
  function change(e) {
    setValues((current) => ({ ...current, [e.target.name]: e.target.value }));
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/profile', { method: 'PATCH', body: values });
      setUser(data.user);
      setEditing(false);
      setNotice('Your profile has been updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 700 * 1024
    ) {
      setError('Choose a PNG, JPEG or WebP image smaller than 700 KB.');
      return;
    }
    setBusy(true);
    try {
      const image = await readImageFile(file);
      const data = await api('/profile/image', { method: 'PUT', body: { image } });
      setUser(data.user);
      setNotice('Your profile image has been updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">YOUR RELIVE</span>
          <h1>Profile</h1>
          <p>Your little corner of reLIVE.</p>
        </div>
        <StatusBadge tone="lavender">
          {user.role === 'ADMIN' ? 'Administrator' : 'Community member'}
        </StatusBadge>
      </div>
      {!editing && error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-message success-message" role="status">
          {notice}
        </p>
      )}
      <div className="surface profile-surface">
        <div className="profile-top">
          <div className="profile-photo">
            {user.profileImage ? (
              <img src={imageUrl(user.profileImage)} alt={user.name + '’s profile'} />
            ) : (
              <UserRound size={50} strokeWidth={1.3} />
            )}
          </div>
          <div className="profile-identity">
            <h2>{user.name}</h2>
            <p>
              <MapPin size={16} />
              {user.state
                ? user.city + ', ' + user.state + ', Malaysia'
                : 'Add your location in Malaysia'}
            </p>
            <small>
              Joined{' '}
              {new Date(user.createdAt).toLocaleDateString('en-MY', {
                month: 'long',
                year: 'numeric',
              })}
            </small>
          </div>
          <Button onClick={edit} disabled={busy}>
            Edit Profile
          </Button>
        </div>
        <Reputation user={user} />
        <div className="profile-actions">
          <Button to={'/users/' + user.id} variant="secondary">
            Public profile & reviews
          </Button>
          <Button to="/my-purchases" variant="ghost">
            My Purchases
          </Button>
          <Button to="/my-sales" variant="ghost">
            My Sales
          </Button>
        </div>
        <dl className="profile-contact">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{user.phone || 'Not added yet'}</dd>
          </div>
        </dl>
        <div className="profile-actions">
          <label className="button button--secondary upload-label">
            {busy ? 'Please wait…' : 'Change profile image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
              disabled={busy}
              aria-label="Change profile image"
            />
          </label>
          <Button variant="ghost" onClick={signOut} disabled={busy}>
            Log out
          </Button>
          {user.role === 'ADMIN' && <Link to="/admin">Admin workspace ↗</Link>}
        </div>
        <small>
          PNG, JPEG or WebP, up to 700 KB. Your email and phone are private account
          details.
        </small>
      </div>
      <Modal
        open={editing}
        onClose={() => {
          if (!busy) setEditing(false);
        }}
        title="Edit your profile"
      >
        <form className="profile-form" onSubmit={save}>
          <Input
            label="Name"
            name="name"
            value={values.name || ''}
            onChange={change}
            required
            minLength={2}
            maxLength={80}
            disabled={busy}
          />
          <Input
            label="Email address"
            name="email"
            type="email"
            value={values.email || ''}
            onChange={change}
            required
            maxLength={254}
            disabled={busy || user.role === 'ADMIN'}
            hint={
              user.role === 'ADMIN'
                ? 'Admin email is managed in backend configuration.'
                : undefined
            }
          />
          <Input
            label="Phone (optional)"
            name="phone"
            type="tel"
            placeholder="+60 12 345 6789"
            value={values.phone || ''}
            onChange={change}
            maxLength={20}
            disabled={busy}
          />
          <LocationFields
            values={{ state: values.state || '', city: values.city || '' }}
            onChange={change}
            disabled={busy}
          />
          <small>
            Location is optional. If added, choose a state and enter your city or area.
          </small>
          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}
          <div className="profile-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

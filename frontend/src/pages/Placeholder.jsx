import {
  Package,
  Handshake,
  Heart,
  Wallet,
  UserRound,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
const content = {
  sell: [
    'Sell Item',
    'A new home for your old favourites.',
    'Your next chapter starts here',
    'Listing creation is coming soon. Pick out something you’re ready to pass on.',
    Plus,
  ],
  listings: [
    'My Listings',
    'All your pre-loved things, in one lovely place.',
    'Make a little room',
    'Your future listings will live here. Selling is coming soon.',
    Package,
  ],
  offers: [
    'My Offers',
    'A little give and take.',
    'Good conversations start with an offer',
    'You’ll be able to keep track of offers you send and receive here.',
    Handshake,
  ],
  favourites: [
    'Favourites',
    'For the things that caught your eye.',
    'Keep a little wishlist',
    'Your saved finds will have a home here when favourites are available.',
    Heart,
  ],
  wallet: [
    'Wallet',
    'A home for your marketplace balance.',
    'Something to look forward to',
    'Wallet balances and transactions are coming later. No payments are available yet.',
    Wallet,
  ],
  profile: [
    'Profile',
    'Your little corner of reLIVE.',
    'Lovely to meet you',
    'Profile details and account settings are coming soon.',
    UserRound,
  ],
  admin: [
    'Admin',
    'A space to care for the community.',
    'Admin workspace',
    'This is a layout preview. Administration tools and access controls will be added later.',
    ShieldCheck,
  ],
};
export default function Placeholder({ page }) {
  const [title, subtitle, heading, description, icon] = content[page];
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">YOUR RELIVE</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <StatusBadge tone="lavender">Coming soon</StatusBadge>
      </div>
      <div className="surface">
        <EmptyState title={heading} description={description} icon={icon} />
      </div>
    </section>
  );
}

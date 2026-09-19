import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import EmptyState from './components/EmptyState';
import Marketplace from './pages/Marketplace';
import ListingDetails from './pages/ListingDetails';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import Admin from './pages/Admin';
import ProtectedRoute from './components/ProtectedRoute';
import ListingForm from './pages/ListingForm';
import MyListings from './pages/MyListings';
import Favourites from './pages/Favourites';
import Offers from './pages/Offers';
import OfferDetails from './pages/OfferDetails';
import Wallet from './pages/Wallet';
import TopUp from './pages/TopUp';
import TopUpConfirmation from './pages/TopUpConfirmation';
import Checkout from './pages/Checkout';
import PaymentSuccess from './pages/PaymentSuccess';
import Transactions from './pages/Transactions';
import TransactionDetails from './pages/TransactionDetails';
import PublicProfile from './pages/PublicProfile';
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'reLIVE — Give it another life.';
  }, [pathname]);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="main-container">
        <Routes>
          <Route path="/" element={<Marketplace />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/listing/:id" element={<ListingDetails />} />
          <Route path="/users/:id" element={<PublicProfile />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/my-purchases"
              element={<Transactions direction="purchases" />}
            />
            <Route path="/my-sales" element={<Transactions direction="sales" />} />
            <Route path="/transactions/:id" element={<TransactionDetails />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallet/top-up" element={<TopUp />} />
            <Route path="/wallet/top-up/:id" element={<TopUpConfirmation />} />
            <Route
              path="/wallet/top-up/:id/success"
              element={<PaymentSuccess kind="top-up" />}
            />
            <Route path="/checkout/:listingId" element={<Checkout />} />
            <Route path="/purchases/:id" element={<PaymentSuccess kind="purchase" />} />
            <Route
              path="/purchases/:id/success"
              element={<PaymentSuccess kind="purchase" />}
            />
            <Route path="/profile" element={<Profile />} />
            <Route path="/sell" element={<ListingForm key="create" />} />
            <Route path="/listing/:id/edit" element={<ListingForm key="edit" />} />
            <Route path="/my-listings" element={<MyListings />} />
            <Route path="/favourites" element={<Favourites />} />
            <Route
              path="/my-offers"
              element={<Navigate to="/my-offers/made" replace />}
            />
            <Route path="/my-offers/made" element={<Offers direction="made" />} />
            <Route path="/my-offers/received" element={<Offers direction="received" />} />
            <Route path="/offers/:id" element={<OfferDetails />} />
          </Route>
          <Route element={<ProtectedRoute admin />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="/login" element={<Auth key="login" />} />
          <Route path="/register" element={<Auth key="register" register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="*"
            element={
              <EmptyState
                title="A little off the beaten path"
                description="This page doesn’t exist. Let’s find your way back."
              />
            }
          />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './auth.jsx';
import { Spinner } from './components/ui.jsx';

import Catalogue from './pages/Catalogue.jsx';
import PackageDetail from './pages/PackageDetail.jsx';
import BookingFlow from './pages/BookingFlow.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Travellers from './pages/Travellers.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import AdminQuery from './pages/AdminQuery.jsx';

/** Routes that need a session. Redirects to login, remembering where to return. */
function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Protected, and refused to anyone whose role isn't the one given. */
function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role_name !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Catalogue />} />
        <Route path="/packages/:id" element={<PackageDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/book/:departureId" element={<Protected><BookingFlow /></Protected>} />
        <Route path="/bookings" element={<Protected><MyBookings /></Protected>} />
        <Route path="/travellers" element={<Protected><Travellers /></Protected>} />
        <Route path="/admin/query" element={<RequireRole role="DB_ADMIN"><AdminQuery /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

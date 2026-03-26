import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';

import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import PerformanceDashboardPage from './pages/PerformanceDashboardPage';
import RoleAnalyticsPage from './pages/RoleAnalyticsPage';
import UploadPage from './pages/UploadPage';
import ClaimDetailPage from './pages/ClaimDetailPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useAuth } from './context/AuthContext';

const PrivateRoute = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected Routes */}
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/analytics" element={<PerformanceDashboardPage />} />
            <Route path="/role-analytics" element={<RoleAnalyticsPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/claims/:id" element={<ClaimDetailPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

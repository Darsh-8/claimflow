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

// HMS pages
import PatientsListPage from './features/hms/patients/pages/PatientsListPage';
import PatientDetailPage from './features/hms/patients/pages/PatientDetailPage';
import DoctorsListPage from './features/hms/doctors/pages/DoctorsListPage';
import WardsListPage from './features/hms/wards/pages/WardsListPage';
import AdmissionsListPage from './features/hms/admissions/pages/AdmissionsListPage';
import AppointmentsListPage from './features/hms/appointments/pages/AppointmentsListPage';
import BillingListPage from './features/hms/billing/pages/BillingListPage';
import HMSAnalyticsPage from './features/hms/analytics/HMSAnalyticsPage';

const PrivateRoute = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const HospitalRoute = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'HOSPITAL') return <Navigate to="/" replace />;
  return <Outlet />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton duration={3500} />
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

        {/* HMS — Hospital role only */}
        <Route element={<HospitalRoute />}>
          <Route element={<Layout />}>
            <Route path="/hms/analytics" element={<HMSAnalyticsPage />} />
            <Route path="/hms/patients" element={<PatientsListPage />} />
            <Route path="/hms/patients/:id" element={<PatientDetailPage />} />
            <Route path="/hms/doctors" element={<DoctorsListPage />} />
            <Route path="/hms/wards" element={<WardsListPage />} />
            <Route path="/hms/admissions" element={<AdmissionsListPage />} />
            <Route path="/hms/appointments" element={<AppointmentsListPage />} />
            <Route path="/hms/billing" element={<BillingListPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AppLayout } from './components/layout/AppLayout';
import { ScreenLoader, ToastContainer, ConnectionStatus, ErrorBoundary } from './components/ui';
import { ReportModal } from './components/ui/ReportModal';
import { AdminLayout } from './components/layout/AdminLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { useSelfPresence } from './hooks/useSelfPresence';
import { useNotifications } from './hooks/useNotifications';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';

const FeedPage = React.lazy(() => import('./pages/FeedPage'));
const ContactsPage = React.lazy(() => import('./pages/ContactsPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage'));
const BannedPage = React.lazy(() => import('./pages/BannedPage'));
const EmailVerificationPage = React.lazy(() => import('./pages/EmailVerificationPage'));
const MobileMenuPage = React.lazy(() => import('./pages/MobileMenuPage'));
const AdminReportsPage = React.lazy(() => import('./pages/AdminReportsPage'));
const AdminUsersPage = React.lazy(() => import('./pages/AdminUsersPage'));

const App: React.FC = () => {
  const { user } = useAuthStore();
  const initializeAuth = useAuthStore(state => state.initialize);

  // Khởi tạo Auth listener
  useEffect(() => {
    const unsubscribeAuth = initializeAuth();
    return () => unsubscribeAuth();
  }, [initializeAuth]);

  // Quản lý trạng thái Online/Offline của bản thân
  useSelfPresence(user);
  // Quản lý thông báo tập trung
  useNotifications();

  return (
    <ErrorBoundary>
      <HashRouter>
        <React.Suspense fallback={<ScreenLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route index element={<ChatPage />} />
              <Route path="feed/*" element={<FeedPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="profile/*" element={<ProfilePage />} />
              <Route path="profile/:userId/*" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="/admin" element={
              <ProtectedRoute requireAdmin>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/admin/reports" replace />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
            </Route>

            <Route path="/menu" element={
              <ProtectedRoute>
                <MobileMenuPage />
              </ProtectedRoute>
            } />

            <Route path="/verify-email" element={<EmailVerificationPage />} />
            <Route path="/banned" element={<BannedPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
        <ConnectionStatus />
        <ToastContainer />
        <ReportModal />
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;

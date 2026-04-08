import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLoadingStore } from '../store/loadingStore';
import { Button } from '../components/ui';
import { Mail, RefreshCw, CheckCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { toast } from '../store/toastStore';
import { TOAST_MESSAGES } from '../constants';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';
import { AuthBrandingPanel } from '../components/layout/AuthBrandingPanel';

const EmailVerificationPage: React.FC = () => {
  const { checkVerificationStatus, sendVerificationEmail, logout } = useAuthStore();
  const isInitialized = useAuthStore(state => state.isInitialized);
  const isLoading = useLoadingStore(state => state.loadingStates['auth.verification']);
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isInitialized) return;
    if (!auth.currentUser) {
      navigate('/login', { replace: true, state: { reason: 'verify_requires_login' } });
    }
  }, [isInitialized, navigate]);

  useEffect(() => {
    const state = location.state as { source?: string } | null;
    if (state?.source === 'register') {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      await checkVerificationStatus();
      if (!useAuthStore.getState().isPendingVerification) {
        toast.success(TOAST_MESSAGES.AUTH.VERIFY_EMAIL_SUCCESS);
        navigate('/onboarding');
      } else {
        toast.info(TOAST_MESSAGES.AUTH.VERIFY_EMAIL_PENDING);
      }
    } catch { toast.error(TOAST_MESSAGES.AUTH.CHECK_STATUS_FAILED); }
    finally { setIsChecking(false); }
  };

  const handleResend = async () => {
    try {
      await sendVerificationEmail();
      toast.success(TOAST_MESSAGES.AUTH.RESEND_VERIFY_SUCCESS);
    } catch { toast.error(TOAST_MESSAGES.AUTH.SEND_EMAIL_FAILED); }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-[100dvh] bg-bg-primary transition-theme">
      <AuthBrandingPanel
        headline={<>Chỉ một bước <br /> Nữa thôi.</>}
        subtext="Để đảm bảo an toàn, vui lòng xác thực email của bạn trước khi bắt đầu khám phá Smurfy."
      />

      {/* ── Right panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-bg-primary transition-theme overflow-y-auto min-h-[100dvh] lg:min-h-0">
        <div className="w-full max-w-[420px] animate-fade-in">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo_text_blue.png" alt="Smurfy" className="h-10 object-contain" />
          </div>

          {/* Icon */}
          <div className="mb-8">
            <div className="relative w-20 h-20 mx-auto mb-6">
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-2xl btn-gradient opacity-20 blur-md" />
              <div className="relative w-20 h-20 btn-gradient rounded-2xl flex items-center justify-center shadow-accent">
                <Mail size={34} className="text-white" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-text-primary mb-2 text-center">
              Xác thực Email
            </h1>
            <p className="text-sm text-text-secondary text-center leading-relaxed max-w-sm mx-auto">
              Chúng tôi đã gửi link xác thực đến email của bạn. Vui lòng kiểm tra hộp thư (và cả mục Spam).
            </p>
          </div>

          {/* Steps hint */}
          <div className="bg-bg-secondary rounded-xl p-4 mb-6 border border-border-light space-y-3">
            {[
              { step: '1', text: 'Mở email từ Smurfy trong hộp thư của bạn' },
              { step: '2', text: 'Nhấn vào link xác thực trong email' },
              { step: '3', text: 'Quay lại đây và nhấn "Đã xác thực email"' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full btn-gradient flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs font-bold">{step}</span>
                </div>
                <p className="text-sm text-text-secondary">{text}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              fullWidth
              size="lg"
              onClick={handleCheckStatus}
              isLoading={isChecking || isLoading}
              icon={<ShieldCheck size={18} />}
            >
              Đã xác thực email
            </Button>

            <Button
              variant="secondary"
              fullWidth
              size="lg"
              onClick={handleResend}
              disabled={isLoading}
              icon={<RefreshCw size={17} />}
            >
              Gửi lại email xác thực
            </Button>
          </div>

          {/* Back to login */}
          <div className="pt-6 mt-2 border-t border-border-light">
            <button
              onClick={handleLogout}
              className="group flex items-center gap-2 text-sm font-medium text-text-tertiary hover:text-error transition-colors duration-200 mx-auto"
            >
              <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
              Quay lại Đăng nhập
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPage;

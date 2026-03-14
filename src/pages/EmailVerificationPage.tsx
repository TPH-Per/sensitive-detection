import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLoadingStore } from '../store/loadingStore';
import { Button } from '../components/ui';
import { Mail, RefreshCw, LogOut, CheckCircle, ArrowLeft } from 'lucide-react';
import { toast } from '../store/toastStore';
import { TOAST_MESSAGES } from '../constants';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase/config';

const EmailVerificationPage: React.FC = () => {
  const { checkVerificationStatus, sendVerificationEmail, logout } = useAuthStore();
  const isInitialized = useAuthStore(state => state.isInitialized);
  const isLoading = useLoadingStore(state => state.loadingStates['auth.verification']);
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!auth.currentUser) {
      navigate('/login', { replace: true, state: { reason: 'verify_requires_login' } });
    }
  }, [isInitialized, navigate]);

  useEffect(() => {
    const state = location.state as { source?: string } | null;
    if (state?.source === 'register') {
      setInfoMessage('Tài khoản đã tạo. Vui lòng xác thực email để tiếp tục.');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      await checkVerificationStatus();

      const currentStore = useAuthStore.getState();
      if (!currentStore.isPendingVerification) {
        toast.success(TOAST_MESSAGES.AUTH.VERIFY_EMAIL_SUCCESS);
        navigate('/');
      } else {
        toast.info(TOAST_MESSAGES.AUTH.VERIFY_EMAIL_PENDING);
      }
    } catch (error) {
      toast.error(TOAST_MESSAGES.AUTH.CHECK_STATUS_FAILED);
    } finally {
      setIsChecking(false);
    }
  };

  const handleResend = async () => {
    try {
      await sendVerificationEmail();
      toast.success(TOAST_MESSAGES.AUTH.RESEND_VERIFY_SUCCESS);
    } catch (error) {
      toast.error(TOAST_MESSAGES.AUTH.SEND_EMAIL_FAILED);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-[100dvh] bg-bg-primary overflow-hidden transition-theme">
      {/* Cánh trái: Branding (Copy từ LoginPage) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-primary via-[#4b8df8] to-[#0047b3] relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[300px] h-[300px] bg-black/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center">
          <img src="/logo_text_white.png" alt="Smurfy" className="h-12 object-contain" />
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-6xl font-bold text-white leading-[1.1]">Chỉ một bước <br /> Nữa thôi.</h2>
          <p className="text-white/80 text-lg font-medium max-w-md">
            Để đảm bảo an toàn, vui lòng xác thực email của bạn trước khi bắt đầu khám phá Smurfy.
          </p>
        </div>

        <div className="relative z-10 text-white/60 text-sm font-medium">
          © {new Date().getFullYear()} Smurfy Social.
        </div>
      </div>

      {/* Cánh phải: Verification Area */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-bg-primary transition-theme">
        <div className="w-full max-w-[420px] fade-in text-center sm:text-left">
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo_text_blue.png" alt="Smurfy" className="h-10 object-contain" />
          </div>

          <div className="mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-6 mx-auto sm:mx-0">
              <Mail size={32} />
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary mb-2">
              Xác thực Email
            </h1>
            <p className="text-text-tertiary text-sm font-medium">
              Chúng tôi đã gửi link xác thực đến email của bạn. Vui lòng kiểm tra hộp thư (và cả mục Spam).
            </p>
          </div>
          {infoMessage && (
            <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3 mb-4">
              <CheckCircle size={18} className="text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-primary font-medium leading-[1.4]">
                {infoMessage}
              </div>
            </div>
          )}
          <div className="space-y-4">
            <Button
              className="w-full h-12 text-sm font-bold rounded-xl shadow-md"
              onClick={handleCheckStatus}
              isLoading={isChecking || isLoading}
              icon={<CheckCircle size={20} />}
            >
              Đã xác thực email
            </Button>

            <Button
              variant="secondary"
              className="w-full h-12 text-sm font-bold rounded-xl text-text-secondary hover:bg-bg-hover active:bg-bg-active transition-all duration-base"
              onClick={handleResend}
              disabled={isLoading}
              icon={<RefreshCw size={18} />}
            >
              Gửi lại email xác thực
            </Button>

            <div className="pt-6 border-t border-border-light mt-8">
              <button
                onClick={handleLogout}
                className="group flex items-center gap-2 text-sm font-bold text-text-tertiary hover:text-error transition-all duration-base mx-auto sm:mx-0"
              >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-all duration-base" />
                Quay lại Đăng nhập
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPage;

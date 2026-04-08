import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '../store/authStore';
import { useLoadingStore } from '../store/loadingStore';
import { Button, Input, Checkbox } from '../components/ui';
import { toast } from '../store/toastStore';
import { TOAST_MESSAGES } from '../constants';
import { Mail, Lock, Eye, EyeOff, User, AlertCircle, CheckCircle } from 'lucide-react';
import { AuthBrandingPanel } from '../components/layout/AuthBrandingPanel';
import {
  loginSchema, registerSchema, forgotPasswordSchema,
  LoginFormValues, RegisterFormValues, ForgotPasswordFormValues,
} from '../utils/validation';

type Tab = 'login' | 'register' | 'forgot';

const LoginPage: React.FC = () => {
  const { login, register, resetPassword, sendVerificationEmail } = useAuthStore();
  const isLoading = useLoadingStore(state =>
    state.loadingStates['auth.login'] || state.loadingStates['auth.register'] || state.loadingStates['auth']
  );
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const forgotForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    const saved = localStorage.getItem('remembered_email');
    if (saved) { loginForm.setValue('email', saved); setRememberMe(true); }
  }, [loginForm]);

  useEffect(() => {
    const state = location.state as { reason?: string; source?: string } | null;
    if (!state) return;
    if (state.source === 'register') {
      setInfoMessage('Tài khoản đã tạo. Vui lòng xác thực email để tiếp tục.');
      setShowResend(true);
    }
    if (state.reason === 'verify_requires_login') {
      setInfoMessage('Vui lòng đăng nhập để xác thực email.');
      setShowResend(false);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const handleAuthError = (error: unknown) => {
    const err = error as { code?: string; message?: string };
    if (err.code === 'auth/email-not-verified') {
      setAuthError(null);
      setInfoMessage('Email chưa được xác thực. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.');
      setShowResend(true);
      return;
    }
    if (err.code === 'auth/user-disabled') { navigate('/banned'); return; }
    const messages: Record<string, string> = {
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/user-not-found': 'Email hoặc mật khẩu không chính xác.',
      'auth/wrong-password': 'Email hoặc mật khẩu không chính xác.',
      'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác.',
      'auth/email-already-in-use': 'Email này đã được sử dụng.',
      'auth/weak-password': 'Mật khẩu quá yếu.',
    };
    const message = (err.code && messages[err.code]) || err.message || 'Thao tác thất bại.';
    setAuthError(message);
  };

  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      setAuthError(null); setInfoMessage(null); setShowResend(false);
      await login(data.email, data.password, rememberMe);
      if (rememberMe) localStorage.setItem('remembered_email', data.email);
      else localStorage.removeItem('remembered_email');
      navigate('/');
    } catch (error) { handleAuthError(error); }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    try {
      setAuthError(null); setInfoMessage(null); setShowResend(false);
      await register(data.email, data.password, data.name);
      toast.success(TOAST_MESSAGES.AUTH.REGISTER_SUCCESS);
      navigate('/verify-email', { state: { source: 'register' } });
    } catch (error) { handleAuthError(error); }
  };

  const onForgotSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      setAuthError(null); setInfoMessage(null); setShowResend(false);
      await resetPassword(data.email);
      toast.success(TOAST_MESSAGES.AUTH.RESET_PASSWORD_SUCCESS);
      setVerificationSent(true);
    } catch (error: unknown) {
      const err = error as { code?: string };
      const message = err.code === 'auth/user-not-found'
        ? 'Email này chưa được đăng ký.'
        : 'Có lỗi xảy ra khi gửi email.';
      toast.error(message);
    }
  };

  const handleResendEmail = async () => {
    try {
      await sendVerificationEmail();
      setAuthError(null); setInfoMessage(null); setShowResend(false); setVerificationSent(true);
      toast.success(TOAST_MESSAGES.AUTH.RESEND_VERIFY_SUCCESS);
    } catch { toast.error(TOAST_MESSAGES.AUTH.SEND_EMAIL_FAILED); }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setAuthError(null); setInfoMessage(null); setShowResend(false); setVerificationSent(false);
  };

  return (
    <div className="flex min-h-[100dvh] bg-bg-primary transition-theme">
      <AuthBrandingPanel
        headline={<>Kết nối <br /> Mọi nơi.</>}
        subtext="Trải nghiệm mạng xã hội thế hệ mới với Smurfy. An toàn và riêng tư."
      />

      {/* ── Right panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-bg-primary transition-theme overflow-y-auto min-h-[100dvh] lg:min-h-0">
        <div className="w-full max-w-[420px] animate-fade-in">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo_text_blue.png" alt="Smurfy" className="h-10 object-contain" />
          </div>

          {/* Tab switcher (login / register only) */}
          {activeTab !== 'forgot' && (
            <div className="flex bg-bg-secondary rounded-xl p-1 mb-8 border border-border-light">
              {(['login', 'register'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200
                    ${activeTab === tab
                      ? 'bg-bg-primary text-text-primary shadow-sm border border-border-light'
                      : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                >
                  {tab === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </button>
              ))}
            </div>
          )}

          {/* Heading */}
          <div className="mb-7">
            {activeTab === 'forgot' ? (
              <>
                <h1 className="text-2xl font-bold text-text-primary mb-1">Khôi phục mật khẩu</h1>
                <p className="text-sm text-text-secondary">Nhập email để nhận link đặt lại mật khẩu.</p>
              </>
            ) : activeTab === 'login' ? (
              <>
                <h1 className="text-2xl font-bold text-text-primary mb-1">Chào mừng trở lại</h1>
                <p className="text-sm text-text-secondary">Đăng nhập để tiếp tục với Smurfy.</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-text-primary mb-1">Tạo tài khoản</h1>
                <p className="text-sm text-text-secondary">Tham gia cộng đồng Smurfy ngay hôm nay.</p>
              </>
            )}
          </div>

          {/* ── Forgot password form ── */}
          {activeTab === 'forgot' && (
            <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4">
              {verificationSent && (
                <div className="flex items-center gap-3 p-3.5 bg-success/5 border border-success/20 rounded-xl animate-fade-in">
                  <CheckCircle size={17} className="text-success shrink-0" />
                  <p className="text-xs font-medium text-success">Email đặt lại mật khẩu đã được gửi!</p>
                </div>
              )}
              <Input
                label="Địa chỉ Email"
                icon={<Mail size={17} />}
                type="email"
                placeholder="Nhập địa chỉ email"
                {...forgotForm.register('email')}
                error={forgotForm.formState.errors.email?.message}
                autoComplete="email"
                size="lg"
              />
              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isLoading}>
                Gửi mã khôi phục
              </Button>
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="text-sm text-text-secondary hover:text-primary font-medium transition-colors duration-200"
                >
                  ← Quay lại đăng nhập
                </button>
              </div>
            </form>
          )}

          {/* ── Login / Register form ── */}
          {activeTab !== 'forgot' && (
            <form
              onSubmit={
                activeTab === 'login'
                  ? loginForm.handleSubmit(onLoginSubmit)
                  : registerForm.handleSubmit(onRegisterSubmit)
              }
              className="space-y-4"
            >
              {/* Info banner */}
              {infoMessage && (
                <div className="flex items-start gap-3 p-3.5 bg-primary/5 border border-primary/20 rounded-xl animate-fade-in">
                  <AlertCircle size={17} className="text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-xs text-primary font-medium leading-relaxed">
                    <p>{infoMessage}</p>
                    {showResend && (
                      <button
                        type="button"
                        onClick={handleResendEmail}
                        className="font-bold underline underline-offset-2 hover:opacity-80 transition-opacity"
                      >
                        Gửi lại email xác thực
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Error banner */}
              {authError && (
                <div className="flex items-center gap-3 p-3.5 bg-error/5 border border-error/20 rounded-xl animate-fade-in">
                  <AlertCircle size={17} className="text-error shrink-0" />
                  <p className="text-xs text-error font-medium leading-relaxed">{authError}</p>
                </div>
              )}

              {/* Verification sent */}
              {verificationSent && !authError && activeTab === 'login' && (
                <div className="flex items-center gap-3 p-3.5 bg-success/5 border border-success/20 rounded-xl animate-fade-in">
                  <CheckCircle size={17} className="text-success shrink-0" />
                  <p className="text-xs text-success font-medium">Đã gửi link xác thực. Vui lòng kiểm tra email.</p>
                </div>
              )}

              {/* Name field (register only) */}
              {activeTab === 'register' && (
                <Input
                  label="Họ và Tên"
                  icon={<User size={17} />}
                  placeholder="Nhập họ tên"
                  {...registerForm.register('name')}
                  error={registerForm.formState.errors.name?.message}
                  size="lg"
                />
              )}

              {/* Email */}
              <Input
                label="Email"
                icon={<Mail size={17} />}
                type="email"
                placeholder="Nhập địa chỉ email"
                {...(activeTab === 'login' ? loginForm.register('email') : registerForm.register('email'))}
                error={activeTab === 'login'
                  ? loginForm.formState.errors.email?.message
                  : registerForm.formState.errors.email?.message
                }
                autoComplete="email"
                size="lg"
              />

              {/* Password */}
              <div>
                <Input
                  label="Mật khẩu"
                  icon={<Lock size={17} />}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu"
                  autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                  {...(activeTab === 'login' ? loginForm.register('password') : registerForm.register('password'))}
                  error={activeTab === 'login'
                    ? loginForm.formState.errors.password?.message
                    : registerForm.formState.errors.password?.message
                  }
                  size="lg"
                  rightElement={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(p => !p)}
                      className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  }
                />
                {activeTab === 'login' && (
                  <div className="flex items-center justify-between mt-2.5">
                    <Checkbox
                      label="Ghi nhớ đăng nhập"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <button
                      type="button"
                      onClick={() => handleTabChange('forgot')}
                      className="text-xs text-primary hover:underline font-semibold transition-colors"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                )}
              </div>

              {/* Confirm password (register only) */}
              {activeTab === 'register' && (
                <Input
                  label="Xác nhận mật khẩu"
                  icon={<Lock size={17} />}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Xác nhận mật khẩu"
                  autoComplete="new-password"
                  {...registerForm.register('confirmPassword')}
                  error={registerForm.formState.errors.confirmPassword?.message}
                  size="lg"
                  rightElement={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(p => !p)}
                      className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  }
                />
              )}

              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isLoading} className="mt-1">
                {activeTab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

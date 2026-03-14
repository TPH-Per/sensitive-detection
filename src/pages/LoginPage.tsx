import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '../store/authStore';
import { useLoadingStore } from '../store/loadingStore';
import { Button, Input, Checkbox } from '../components/ui';
import { toast } from '../store/toastStore';
import { TOAST_MESSAGES } from '../constants';
import { Mail, Lock, Eye, EyeOff, User, AlertCircle } from 'lucide-react';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  LoginFormValues,
  RegisterFormValues,
  ForgotPasswordFormValues
} from '../utils/validation';

const LoginPage: React.FC = () => {
  const { login, register, resetPassword, sendVerificationEmail } = useAuthStore();
  const isLoading = useLoadingStore(state =>
    state.loadingStates['auth.login'] || state.loadingStates['auth.register'] || state.loadingStates['auth']
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Form Login
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  // Form Register
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' }
  });

  // Form Forgot Password
  const forgotForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' }
  });

  // Load email đã ghi nhớ
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      loginForm.setValue('email', savedEmail);
      setRememberMe(true);
    }
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
    const errorCode = err.code;
    let message = "Đã có lỗi xảy ra. Vui lòng thử lại.";
    if (errorCode === 'auth/email-not-verified') {
      setAuthError(null);
      setInfoMessage('Email chưa được xác thực. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.');
      setShowResend(true);
      toast.info('Email chưa được xác thực. Vui lòng xác thực email.');
      return;
    }

    switch (errorCode) {
      case 'auth/invalid-email': message = "Email không hợp lệ."; break;
      case 'auth/user-disabled': message = "Tài khoản này đã bị khóa."; break;
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': message = "Email hoặc mật khẩu không chính xác."; break;
      case 'auth/email-already-in-use': message = "Email này đã được sử dụng."; break;
      case 'auth/weak-password': message = "Mật khẩu quá yếu."; break;
      default: message = err.message || "Thao tác thất bại.";
    }

    setAuthError(message);
    toast.error(message);
  };

  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      setAuthError(null);
      setInfoMessage(null);
      setShowResend(false);
      await login(data.email, data.password, rememberMe);

      if (rememberMe) {
        localStorage.setItem('remembered_email', data.email);
      } else {
        localStorage.removeItem('remembered_email');
      }

      navigate('/');
    } catch (error) {
      handleAuthError(error);
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    try {
      setAuthError(null);
      setInfoMessage(null);
      setShowResend(false);
      await register(data.email, data.password, data.name);
      setVerificationSent(true);
      toast.success(TOAST_MESSAGES.AUTH.REGISTER_SUCCESS);
      navigate('/verify-email', { state: { source: 'register' } });
    } catch (error) {
      handleAuthError(error);
    }
  };

  const onForgotSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      setAuthError(null);
      setInfoMessage(null);
      setShowResend(false);
      await resetPassword(data.email);
      toast.success(TOAST_MESSAGES.AUTH.RESET_PASSWORD_SUCCESS);
      setVerificationSent(true);
    } catch (error: unknown) {
      const err = error as { code?: string };
      let message = "Có lỗi xảy ra khi gửi email.";
    if (err.code === 'auth/email-not-verified') { // Changed errorCode to err.code
      setAuthError(null);
      setInfoMessage('Email chưa được xác thực. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.');
      setShowResend(true);
      toast.info('Email chưa được xác thực. Vui lòng xác thực email.');
      return;
    }
      if (err.code === 'auth/user-not-found') message = "Email này chưa được đăng ký.";
      toast.error(message);
    }
  };

  const handleResendEmail = async () => {
    try {
      await sendVerificationEmail();
      setAuthError(null);
      setInfoMessage(null);
      setShowResend(false);
      setVerificationSent(true);
      toast.success(TOAST_MESSAGES.AUTH.RESEND_VERIFY_SUCCESS);
    } catch (error) {
      toast.error(TOAST_MESSAGES.AUTH.SEND_EMAIL_FAILED);
    }
  };

  const handleTabChange = (tab: 'login' | 'register' | 'forgot') => {
    setActiveTab(tab);
    setAuthError(null);
    setInfoMessage(null);
    setShowResend(false);
    setVerificationSent(false);
  };

  return (
    <div className="flex min-h-[100dvh] bg-bg-primary overflow-hidden transition-theme">
      {/* Cánh trái: Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-primary via-[#4b8df8] to-[#0047b3] relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[300px] h-[300px] bg-black/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center">
          <img src="/logo_text_white.png" alt="Smurfy" className="h-12 object-contain" />
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-6xl font-bold text-white leading-[1.1]">Kết nối <br /> Mọi nơi.</h2>
          <p className="text-white/80 text-lg font-medium max-w-md">
            Trải nghiệm mạng xã hội thế hệ mới với Smurfy. An toàn và riêng tư.
          </p>
        </div>

        <div className="relative z-10 text-white/60 text-sm font-medium">
          © {new Date().getFullYear()} Smurfy Social.
        </div>
      </div>

      {/* Cánh phải: Form Area */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-bg-primary transition-theme">
        <div className="w-full max-w-[420px] fade-in">
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo_text_blue.png" alt="Smurfy" className="h-10 object-contain" />
          </div>

          <div className="mb-8 text-center sm:text-left">
            <h1 className="text-3xl font-extrabold text-text-primary mb-2">
              {activeTab === 'login' ? 'Chào mừng trở lại' : activeTab === 'register' ? 'Tham gia ngay' : 'Khôi phục mật khẩu'}
            </h1>
            <p className="text-text-tertiary text-sm font-medium">
              {activeTab === 'login' ? "Đăng nhập để tiếp tục." : activeTab === 'register' ? "Tạo tài khoản mới." : "Nhập email của bạn."}
            </p>
          </div>

          {activeTab === 'forgot' ? (
            <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-5">
              {verificationSent && (
                <div className="p-3 text-xs font-semibold text-success bg-success-light/30 border border-success/30 rounded-xl mb-4">
                  Email đặt lại mật khẩu đã được gửi!
                </div>
              )}

              <Input
                label="Địa chỉ Email"
                icon={<Mail size={18} />}
                type="email"
                placeholder="Nhập địa chỉ email"
                {...forgotForm.register('email')}
                error={forgotForm.formState.errors.email?.message}
                autoComplete="email"
                size="lg"
                className="rounded-xl"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-bold rounded-xl shadow-md"
                isLoading={isLoading}
              >
                Gửi mã khôi phục
              </Button>

              <div className="text-center pt-2">
                <Button variant="ghost" type="button" onClick={() => handleTabChange('login')}>
                  Quay lại đăng nhập
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <form
                onSubmit={activeTab === 'login' ? loginForm.handleSubmit(onLoginSubmit) : registerForm.handleSubmit(onRegisterSubmit)}
                className="space-y-4"
              >
                {infoMessage && (
                  <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                    <AlertCircle size={18} className="text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1.5 text-xs text-primary font-medium leading-[1.4]">
                      <p>{infoMessage}</p>
                      {showResend && (
                        <button type="button" onClick={handleResendEmail} className="text-primary hover:underline font-bold block">
                          Gửi lại email xác thực
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {authError && (
                  <div className="p-3.5 bg-error/5 border border-error/20 rounded-xl flex items-start gap-3">
                    <AlertCircle size={18} className="text-error shrink-0 mt-0.5" />
                    <div className="space-y-1.5 text-xs text-error font-medium leading-[1.4]">
                      <p>{authError}</p>
                    </div>
                  </div>
                )}

                {verificationSent && !authError && activeTab === 'login' && (
                  <div className="p-3.5 bg-success/5 border border-success/20 rounded-xl flex items-start gap-3">
                    <AlertCircle size={18} className="text-success shrink-0 mt-0.5" />
                    <div className="text-xs text-success font-medium">
                      Đã gửi link xác thực. Vui lòng kiểm tra email.
                    </div>
                  </div>
                )}

                {activeTab === 'register' && (
                  <Input
                    label="Họ và Tên"
                    icon={<User size={18} />}
                    placeholder="Nhập họ tên"
                    {...registerForm.register('name')}
                    error={registerForm.formState.errors.name?.message}
                    size="lg"
                    className="rounded-xl"
                  />
                )}

                <Input
                  label="Email"
                  icon={<Mail size={18} />}
                  type="email"
                  placeholder="Nhập địa chỉ email"
                  {...(activeTab === 'login' ? loginForm.register('email') : registerForm.register('email'))}
                  error={activeTab === 'login' ? loginForm.formState.errors.email?.message : registerForm.formState.errors.email?.message}
                  autoComplete="email"
                  size="lg"
                  className="rounded-xl"
                />

                <div className="space-y-1.5">
                  <Input
                    label="Mật khẩu"
                    icon={<Lock size={18} />}
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                    {...(activeTab === 'login' ? loginForm.register('password') : registerForm.register('password'))}
                    error={activeTab === 'login' ? loginForm.formState.errors.password?.message : registerForm.formState.errors.password?.message}
                    className="rounded-xl"
                    rightElement={
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-2 text-text-tertiary hover:text-text-secondary"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                  />
                  {activeTab === 'login' && (
                    <div className="flex items-center justify-between mt-1">
                      <Checkbox
                        label="Ghi nhớ đăng nhập"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <button type="button" onClick={() => handleTabChange('forgot')} className="text-xs text-primary hover:underline font-bold">
                        Quên mật khẩu?
                      </button>
                    </div>
                  )}
                </div>

                {activeTab === 'register' && (
                  <Input
                    label="Xác nhận mật khẩu"
                    icon={<Lock size={18} />}
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Xác nhận mật khẩu"
                    autoComplete="new-password"
                    {...registerForm.register('confirmPassword')}
                    error={registerForm.formState.errors.confirmPassword?.message}
                    size="lg"
                    className="rounded-xl"
                    rightElement={
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="p-2 text-text-tertiary hover:text-text-secondary"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                  />
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full font-bold rounded-xl shadow-md mt-2"
                  isLoading={isLoading}
                >
                  {activeTab === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </Button>
              </form>

              <div className="text-center text-sm">
                <span className="text-text-tertiary">{activeTab === 'login' ? "Chưa có tài khoản?" : "Đã có tài khoản?"}</span>{' '}
                <button onClick={() => handleTabChange(activeTab === 'login' ? 'register' : 'login')} className="text-primary hover:underline font-bold">
                  {activeTab === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
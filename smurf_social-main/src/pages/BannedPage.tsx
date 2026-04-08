import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, LogOut, AlertCircle, ShieldOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui';
import { notificationService } from '../services/notificationService';

const BannedPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [banReason, setBanReason] = useState<string>('');

  useEffect(() => {
    const fetchBanReason = async () => {
      const userId = user?.id;
      if (!userId) return;
      try {
        const notifications = await notificationService.getLatestSystemNotifications(userId);
        const banNotification = notifications.find(n =>
          (n.data?.contentSnippet ?? '').includes('bị khóa')
        );
        setBanReason(
          banNotification?.data?.contentSnippet ??
          'Tài khoản của bạn đã bị khóa do vi phạm quy định cộng đồng.'
        );
      } catch {
        setBanReason('Tài khoản của bạn đã bị khóa do vi phạm quy định cộng đồng.');
      }
    };
    fetchBanReason();
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">

        {/* Card */}
        <div className="bg-bg-primary rounded-2xl border border-border-light shadow-xl overflow-hidden">

          {/* Top accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-error via-error/80 to-error/60" />

          <div className="p-8">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-error/20 blur-xl" />
                <div className="relative w-20 h-20 bg-error/10 rounded-full flex items-center justify-center border border-error/20">
                  <ShieldOff size={36} className="text-error" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-text-primary mb-1.5">
                Tài khoản đã bị khóa
              </h1>
              <p className="text-sm text-text-secondary">
                Tài khoản của bạn đã bị tạm ngưng bởi ban quản trị.
              </p>
            </div>

            {/* Ban reason */}
            {banReason && (
              <div className="bg-error/5 border border-error/15 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="text-error mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-error uppercase tracking-wide mb-1">
                      Lý do vi phạm
                    </p>
                    <p className="text-sm text-text-secondary leading-relaxed">{banReason}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-border-light my-5" />

            {/* Appeal section */}
            <div className="bg-bg-secondary rounded-xl p-4 mb-6 border border-border-light">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Mail size={14} className="text-primary" />
                </div>
                <h3 className="font-semibold text-sm text-text-primary">Khiếu nại quyết định</h3>
              </div>
              <p className="text-xs text-text-tertiary mb-3 leading-relaxed">
                Nếu bạn cho rằng đây là một sự nhầm lẫn, hãy liên hệ ban quản trị để được xem xét lại.
              </p>
              <a
                href="mailto:support@smurfy.com"
                className="group inline-flex items-center gap-2 px-3 py-2 bg-bg-primary border border-border-light rounded-lg hover:border-primary/30 hover:shadow-sm transition-all duration-200"
              >
                <Lock size={13} className="text-text-tertiary group-hover:text-primary transition-colors" />
                <span className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
                  support@smurfy.com
                </span>
              </a>
            </div>

            {/* Logout */}
            <Button
              variant="danger"
              fullWidth
              size="lg"
              icon={<LogOut size={17} />}
              onClick={handleLogout}
            >
              Đăng xuất
            </Button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-text-tertiary mt-4">
          © {new Date().getFullYear()} Smurfy Social
        </p>
      </div>
    </div>
  );
};

export default BannedPage;

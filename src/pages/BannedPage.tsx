import React, { useEffect, useState } from 'react';
import { Lock, Mail, LogOut, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui';
import { notificationService } from '../services/notificationService';

const BannedPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [banReason, setBanReason] = useState<string>('');

  useEffect(() => {
    const fetchBanReason = async () => {
      if (!user?.uid) return;

      try {
        const notifications = await notificationService.getLatestSystemNotifications(user.uid);
        const banNotification = notifications.find(n =>
          n.type === 'system' &&
          n.data?.contentSnippet?.includes('khóa')
        );

        if (banNotification?.data?.contentSnippet) {
          setBanReason(banNotification.data.contentSnippet);
        }
      } catch (error) {
        console.error('Lỗi lấy lý do khóa:', error);
      }
    };

    fetchBanReason();
  }, [user?.uid]);

  const handleLogout = async () => {
    await logout();
    window.location.href = '#/login';
  };

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="bg-bg-primary rounded-2xl shadow-lg border border-border-light max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock size={40} className="text-error" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-text-primary mb-3">
          TÀI KHOẢN ĐÃ BỊ KHÓA
        </h1>

        {/* Description */}
        <p className="text-text-secondary mb-4">
          Tài khoản của bạn đã bị khóa do vi phạm quy tắc cộng đồng của Smurfy.
        </p>

        {/* Ban Reason */}
        {banReason && (
          <div className="bg-error/5 border border-error/20 rounded-lg p-4 mb-6 text-left">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-error mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">Lý do:</p>
                <p className="text-sm text-text-secondary">{banReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border-light my-6" />

        {/* Appeal Section */}
        <div className="text-left bg-bg-secondary rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            Khiếu nại quyết định
          </h3>
          <p className="text-sm text-text-secondary mb-3">
            Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ với chúng tôi:
          </p>
          <a
            href="mailto:support@smurfy.com"
            className="text-primary font-medium hover:underline text-sm flex items-center gap-1.5"
          >
            <Mail size={14} />
            support@smurfy.com
          </a>
        </div>

        {/* Logout Button */}
        <Button
          variant="danger"
          className="w-full"
          icon={<LogOut size={18} />}
          onClick={handleLogout}
        >
          Đăng xuất
        </Button>
      </div>
    </div>
  );
};

export default BannedPage;

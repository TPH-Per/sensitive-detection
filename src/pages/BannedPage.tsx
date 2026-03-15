import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, LogOut, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui';
import { notificationService } from '../services/notificationService';

const BannedPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [banReason, setBanReason] = useState<string>('');

  useEffect(() => {
    const fetchBanReason = async () => {
      if (!user?.id) return;

      try {
        const notifications = await notificationService.getLatestSystemNotifications(user.id);
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
  }, [user?.id]);

  const handleAction = async () => {
    if (user) {
      await logout();
    }
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="bg-bg-primary rounded-2xl shadow-lg border border-border-light max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock size={40} className="text-error" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black text-text-primary mb-3">
          TÀI KHOẢN ĐÃ BỊ KHÓA
        </h1>

        {/* Description */}
        <p className="text-text-secondary mb-4 font-medium">
          Tài khoản của bạn đã bị khóa do vi phạm bộ quy tắc cộng đồng của Smurfy Social.
        </p>

        {/* Ban Reason */}
        {banReason && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-error mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-text-primary uppercase tracking-wider">Chi tiết vi phạm:</p>
                <p className="text-sm text-text-secondary leading-relaxed">{banReason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border-light my-6" />

        {/* Appeal Section */}
        <div className="text-left bg-bg-secondary/50 rounded-2xl p-5 mb-6 border border-border-light">
          <h3 className="font-bold text-text-primary mb-2 flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            Khiếu nại quyết định
          </h3>
          <p className="text-xs text-text-tertiary mb-4 leading-relaxed font-medium">
            Nếu bạn cho rằng đây là một sự nhầm lẫn, vui lòng liên hệ với ban quản trị qua địa chỉ email dưới đây để được xem xét lại.
          </p>
          <a
            href="mailto:support@smurfy.com"
            className="group inline-flex items-center gap-2.5 px-3.5 py-2 bg-bg-primary border border-border-light rounded-xl hover:border-primary/30 transition-all shadow-sm"
          >
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
              <Mail size={12} />
            </div>
            <span className="text-sm font-bold text-text-primary group-hover:text-primary">support@smurfy.com</span>
          </a>
        </div>

        {/* Action Button */}
        <Button
          variant={user ? "danger" : "primary"}
          className="w-full h-12 rounded-xl font-bold"
          icon={user ? <LogOut size={18} /> : undefined}
          onClick={handleAction}
        >
          {user ? 'Đăng xuất' : 'Quay lại đăng nhập'}
        </Button>
      </div>
    </div>
  );
};

export default BannedPage;

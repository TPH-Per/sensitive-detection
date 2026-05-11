import React, { useState, useCallback } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Modal } from '../ui';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { TOAST_MESSAGES } from '../../constants';
import { changePasswordSchema, ChangePasswordFormValues } from '../../utils/validation';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [showPasswords, setShowPasswords] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors, isDirty, isValid } } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const toggleVisibility = useCallback(() => setShowPasswords(v => !v), []);

  const onSubmit = useCallback(async (data: ChangePasswordFormValues) => {
    setError(null);
    setIsLoading(true);
    try {
      await authService.reauthenticate(data.currentPassword);
      await authService.changePassword(data.newPassword);
      setSuccess(true);
      toast.success(TOAST_MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS);
      setTimeout(async () => {
        await logout();
        onClose();
        navigate('/login');
      }, 2000);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'auth/wrong-password'
          ? 'Mật khẩu hiện tại không chính xác.'
          : 'Có lỗi xảy ra. Vui lòng thử lại sau.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [logout, onClose, navigate]);

  if (!isOpen) return null;

  const passwordType = showPasswords ? 'text' : 'password';
  const hasErrors = Object.keys(errors).length > 0;

  const visibilityBtn = (
    <button
      type="button"
      tabIndex={-1}
      onClick={toggleVisibility}
      className="p-2 text-text-tertiary hover:text-text-secondary transition-colors duration-200"
    >
      {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Đổi mật khẩu"
      maxWidth="md"
      fullScreen="mobile"
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isLoading} className="flex-1">
            Hủy
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit(onSubmit)}
            isLoading={isLoading}
            disabled={isLoading || success}
            className="flex-1"
          >
            Lưu thay đổi
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Vui lòng nhập mật khẩu hiện tại và mật khẩu mới của bạn.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3.5 bg-error/5 border border-error/20 rounded-xl text-error text-sm animate-fade-in">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-2 p-3.5 bg-success/5 border border-success/20 rounded-xl text-success text-sm animate-fade-in">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span className="font-medium">Đổi mật khẩu thành công!</span>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-3">
          <Input
            label="Mật khẩu hiện tại"
            type={passwordType}
            {...register('currentPassword')}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu hiện tại"
            icon={<Lock size={17} />}
            error={errors.currentPassword?.message}
            rightElement={visibilityBtn}
            size="lg"
          />
          <Input
            label="Mật khẩu mới"
            type={passwordType}
            {...register('newPassword')}
            autoComplete="new-password"
            placeholder="Nhập mật khẩu mới"
            icon={<Lock size={17} />}
            error={errors.newPassword?.message}
            rightElement={visibilityBtn}
            size="lg"
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type={passwordType}
            {...register('confirmPassword')}
            autoComplete="new-password"
            placeholder="Xác nhận mật khẩu mới"
            icon={<Lock size={17} />}
            error={errors.confirmPassword?.message}
            rightElement={visibilityBtn}
            size="lg"
          />
        </div>
      </div>
    </Modal>
  );
};

export default ChangePasswordModal;

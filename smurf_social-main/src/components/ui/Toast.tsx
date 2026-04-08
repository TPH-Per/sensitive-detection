import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, ToastType } from '../../store/toastStore';
import { IconButton } from './IconButton';

const toastConfig: Record<ToastType, { icon: React.ReactNode; bar: string }> = {
  success: {
    icon: <CheckCircle className="text-success" size={18} />,
    bar: 'bg-success',
  },
  error: {
    icon: <AlertCircle className="text-error" size={18} />,
    bar: 'bg-error',
  },
  info: {
    icon: <Info className="text-info" size={18} />,
    bar: 'bg-info',
  },
  warning: {
    icon: <AlertTriangle className="text-warning" size={18} />,
    bar: 'bg-warning',
  },
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 pointer-events-none w-full px-4 max-w-[calc(100vw-2rem)] sm:max-w-md"
      style={{ zIndex: 'var(--z-toast)' }}
    >
      {toasts.map((toast) => {
        const config = toastConfig[toast.type];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto relative flex items-center gap-3 bg-bg-primary border border-border-light pl-4 pr-3 py-3 rounded-xl shadow-lg animate-fade-in w-full max-w-md overflow-hidden transition-theme"
            role="alert"
          >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${config.bar}`} />
            <div className="shrink-0">{config.icon}</div>
            <p className="flex-1 text-sm font-medium text-text-primary">{toast.message}</p>
            <IconButton
              onClick={() => removeToast(toast.id)}
              className="shrink-0"
              icon={<X size={15} />}
              size="sm"
            />
          </div>
        );
      })}
    </div>
  );
};

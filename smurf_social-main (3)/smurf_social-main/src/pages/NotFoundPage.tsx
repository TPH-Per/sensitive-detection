import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, FileQuestion } from 'lucide-react';
import { Button } from '../components/ui';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-bg-secondary bg-app-pattern flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] md:w-[400px] h-[300px] md:h-[400px] bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg text-center animate-fade-in flex flex-col items-center">
        
        {/* 404 Text */}
        <h1 className="text-[7rem] md:text-[10rem] font-black leading-none text-transparent bg-clip-text bg-gradient-to-br from-primary via-[#4d8aff] to-primary/40 drop-shadow-sm mb-6">
          404
        </h1>

        {/* Messages */}
        <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
          Trang không tồn tại
        </h2>
        <p className="text-base text-text-secondary max-w-md mx-auto mb-10 leading-relaxed px-4">
          Đường dẫn bạn truy cập hiện không khả dụng. Vui lòng kiểm tra lại địa chỉ hoặc sử dụng các nút bên dưới để điều hướng.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-[360px] mx-auto px-4">
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            icon={<ArrowLeft size={20} />}
            onClick={() => navigate(-1)}
            className="order-2 sm:order-1"
          >
            Quay lại
          </Button>
          <Button
            fullWidth
            size="lg"
            variant="primary"
            icon={<Home size={20} />}
            onClick={() => navigate('/')}
            className="order-1 sm:order-2"
          >
            Về trang chủ
          </Button>
        </div>

      </div>

      {/* Footer note */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-[11px] font-medium text-text-tertiary">
          © {new Date().getFullYear()} Smurfy Social
        </p>
      </div>
    </div>
  );
};

export default NotFoundPage;

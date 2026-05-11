import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  MapPin, Sparkles, ArrowRight, X, SkipForward,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button, SearchableSelect } from '../components/ui';
import type { SearchableOption } from '../components/ui/SearchableSelect';
import { AuthBrandingPanel } from '../components/layout/AuthBrandingPanel';
import { onboardingSchema, OnboardingFormValues } from '../utils/validation';
import { toast } from '../store/toastStore';
import { API_ENDPOINTS, VALIDATION } from '../constants';



const INTEREST_SUGGESTIONS = [
  'Du lịch', 'Âm nhạc', 'Thể thao', 'Đọc sách', 'Gaming', 'Nấu ăn',
  'Nhiếp ảnh', 'Phim ảnh', 'Fitness', 'Nghệ thuật', 'Công nghệ', 'Thời trang',
  'Yoga', 'Cà phê', 'Bóng đá', 'Bơi lội', 'Vẽ tranh', 'Karaoke',
];

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [interestInput, setInterestInput] = useState('');
  const [provinces, setProvinces] = useState<SearchableOption[]>([]);
  const [provincesLoaded, setProvincesLoaded] = useState(false);

  const {
    setValue, watch, handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      location: user?.location || '',
      interests: user?.interests || [],
    },
  });

  const formData = watch();

  /**
   * Tải danh sách tỉnh thành từ API
   */
  React.useEffect(() => {
    let isMounted = true;
    if (provincesLoaded) return;
    fetch(API_ENDPOINTS.PROVINCES)
      .then(res => res.json())
      .then((data: { name: string }[]) => {
        if (!isMounted) return;
        setProvinces(data.map(p => ({ value: p.name, label: p.name })));
        setProvincesLoaded(true);
      })
      .catch(() => { /* silent */ });
    return () => { isMounted = false; };
  }, [provincesLoaded]);

  const handleAddInterest = useCallback((tag: string) => {
    const current = formData.interests ?? [];
    if (current.includes(tag)) return;
    
    if (current.length >= VALIDATION.INTEREST_MAX_COUNT) {
      toast.error(`Bạn chỉ có thể chọn tối đa ${VALIDATION.INTEREST_MAX_COUNT} sở thích`);
      return;
    }
    
    setValue('interests', [...current, tag]);
  }, [formData.interests, setValue]);

  const handleRemoveInterest = useCallback((tag: string) => {
    setValue('interests', (formData.interests ?? []).filter(t => t !== tag));
  }, [formData.interests, setValue]);

  const handleInterestInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = interestInput.trim();
      if (val) { handleAddInterest(val); setInterestInput(''); }
    }
  };

  const handleSkip = async () => {
    try {
      setIsSubmitting(true);
      await completeOnboarding({});
      navigate('/', { replace: true });
    } catch {
      navigate('/', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: OnboardingFormValues) => {
    setIsSubmitting(true);
    try {
      await completeOnboarding({
        location: data.location,
        interests: data.interests,
      });
      toast.success('Hồ sơ đã sẵn sàng!');
      navigate('/', { replace: true });
    } catch {
      toast.error('Không thể cập nhật, vui lòng thử lại');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen lg:overflow-hidden bg-bg-secondary selection:bg-primary/20">
      <AuthBrandingPanel
        headline={<>Cá nhân hóa <br /> Trải nghiệm.</>}
        subtext="Chia sẻ một chút về bạn để Smurfy kết nối bạn với những người bạn tâm đầu ý hợp nhất."
      />

      <div className="w-full lg:w-1/2 h-full bg-bg-primary transition-theme overflow-hidden">
        <div className="h-full flex flex-col p-6 md:p-12 animate-fade-in">
          <div className="w-full max-w-[480px] mx-auto h-full flex flex-col">
            
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-8 flex-shrink-0">
              <img src="/logo_text_blue.png" alt="Smurfy" className="h-10 object-contain" />
            </div>

            {/* Header - Fixed */}
            <div className="mb-8 flex-shrink-0">
              <h1 className="text-2xl font-bold text-text-primary mb-1">Chào mừng bạn!</h1>
              <p className="text-sm text-text-secondary leading-relaxed">
                Hoàn thiện một vài thông tin cơ bản để Smurfy giúp bạn tìm thấy những người bạn cùng sở thích.
              </p>
            </div>

            {/* Body - Scrollable */}
            <div className="flex-1 overflow-y-auto scroll-hide px-0.5">
              <div className="space-y-8 pb-4 px-1.5">
                {/* Location Selection */}
                <SearchableSelect
                  label="Bạn đang ở đâu?"
                  value={formData.location || ''}
                  onChange={(val) => setValue('location', val)}
                  options={provinces}
                  placeholder="Chọn thành phố của bạn"
                  searchPlaceholder="Tìm kiếm thành phố..."
                  error={errors.location?.message}
                  size="lg"
                />

                {/* Interests Section */}
                <div className="space-y-6">
                  {/* Input Field */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[13px] font-semibold text-text-primary">
                        Sở thích của bạn
                      </label>
                      <span className="text-[11px] font-bold text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded-full border border-border-light">
                        {formData.interests?.length ?? 0}/{VALIDATION.INTEREST_MAX_COUNT}
                      </span>
                    </div>
                    <div className="relative group">
                      <input
                        type="text"
                        value={interestInput}
                        onChange={e => setInterestInput(e.target.value)}
                        onKeyDown={handleInterestInput}
                        placeholder="Âm nhạc, Du lịch, Gaming..."
                        className="w-full h-12 px-4 text-sm rounded-xl border border-border-light bg-bg-secondary text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all pr-12"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-primary transition-colors">
                        <Sparkles size={18} />
                      </div>
                    </div>
                    {errors.interests && (
                      <p className="mt-1.5 ml-1 text-xs text-error font-medium flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-error" /> {errors.interests.message}
                      </p>
                    )}
                  </div>

                  {/* Suggestions Cloud */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider ml-1">Gợi ý cho bạn</p>
                    <div className="flex flex-wrap gap-2">
                      {INTEREST_SUGGESTIONS.filter(s => !(formData.interests ?? []).includes(s)).slice(0, 15).map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddInterest(tag)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shadow-sm
                            ${(formData.interests?.length ?? 0) >= VALIDATION.INTEREST_MAX_COUNT 
                              ? 'border-border-light bg-bg-secondary text-text-tertiary cursor-pointer' 
                              : 'border-border-light bg-bg-primary text-text-secondary hover:border-primary hover:text-primary hover:bg-primary/5'
                            }`}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selected Tags Display */}
                  {formData.interests && formData.interests.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-border-light animate-fade-in">
                      {formData.interests.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-primary text-white shadow-md shadow-primary/20 animate-scale-in"
                        >
                          {tag}
                          <button 
                            type="button" 
                            onClick={() => handleRemoveInterest(tag)} 
                            className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                          >
                            <X size={12} strokeWidth={3} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer - Sticky/Fixed */}
            <div className="mt-auto pt-6 border-t border-border-light bg-bg-primary flex-shrink-0">
              <div className="space-y-4">
                <Button 
                  fullWidth 
                  size="lg" 
                  onClick={handleSubmit(onSubmit)} 
                  isLoading={isSubmitting}
                  className="h-12 shadow-lg shadow-primary/20"
                >
                  Tiếp tục vào trang chủ
                </Button>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={isSubmitting}
                    className="group flex items-center gap-2 text-xs font-bold text-text-tertiary hover:text-primary transition-all py-1"
                  >
                    BỎ QUA BƯỚC NÀY
                    <SkipForward size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;

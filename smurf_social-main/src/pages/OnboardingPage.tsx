import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Timestamp } from 'firebase/firestore';
import {
  UserCircle, MapPin, BookOpen, Sparkles, ArrowRight, ArrowLeft, CheckCircle, SkipForward,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Gender } from '../../shared/types';
import { Button, DatePicker, SearchableSelect } from '../components/ui';
import type { SearchableOption } from '../components/ui/SearchableSelect';
import { AuthBrandingPanel } from '../components/layout/AuthBrandingPanel';
import { onboardingSchema, OnboardingFormValues } from '../utils/validation';
import { toast } from '../store/toastStore';
import { API_ENDPOINTS } from '../constants';
import schoolsData from '../assets/data/schools.json';

const STEPS = [
  {
    id: 1,
    title: 'Thông tin cơ bản',
    subtitle: 'Giúp chúng tôi biết thêm về bạn',
    icon: UserCircle,
  },
  {
    id: 2,
    title: 'Vị trí & Học vấn',
    subtitle: 'Kết nối với người cùng khu vực và trường học',
    icon: MapPin,
  },
  {
    id: 3,
    title: 'Sở thích của bạn',
    subtitle: 'Tìm bạn bè có cùng đam mê',
    icon: Sparkles,
  },
] as const;

const GENDER_OPTIONS = [
  { value: Gender.MALE, label: 'Nam' },
  { value: Gender.FEMALE, label: 'Nữ' },
  { value: Gender.NONE, label: 'Khác' },
];

const INTEREST_SUGGESTIONS = [
  'Du lịch', 'Âm nhạc', 'Thể thao', 'Đọc sách', 'Gaming', 'Nấu ăn',
  'Nhiếp ảnh', 'Phim ảnh', 'Fitness', 'Nghệ thuật', 'Công nghệ', 'Thời trang',
  'Yoga', 'Cà phê', 'Bóng đá', 'Bơi lội', 'Vẽ tranh', 'Karaoke',
];

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuthStore();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [interestInput, setInterestInput] = useState('');
  const [provinces, setProvinces] = useState<SearchableOption[]>([]);
  const [provincesLoaded, setProvincesLoaded] = useState(false);

  const schoolOptions = useMemo<SearchableOption[]>(() =>
    schoolsData.map(s => ({ value: s.name, label: s.name, code: s.code })),
    []
  );

  const {
    setValue, watch, handleSubmit, trigger,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      gender: user?.gender,
      dob: undefined,
      location: user?.location || '',
      school: user?.school || '',
      interests: user?.interests || [],
    },
  });

  const formData = watch();

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

  const handleNextStep = async () => {
    let isValid = true;
    if (step === 1) isValid = await trigger(['gender', 'dob']);
    if (step === 2) isValid = await trigger(['location', 'school']);

    if (!isValid) return;
    if (step < 3) setStep(s => s + 1);
  };

  const handlePrevStep = useCallback(() => {
    if (step > 1) setStep(s => s - 1);
  }, [step]);

  const handleAddInterest = useCallback((tag: string) => {
    const current = formData.interests ?? [];
    if (current.includes(tag) || current.length >= 10) return;
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
      const payload: Record<string, unknown> = {};
      if (data.gender !== undefined) payload.gender = data.gender;
      if (data.dob !== undefined) payload.dob = Timestamp.fromDate(new Date(data.dob));
      if (data.location) payload.location = data.location;
      if (data.school) payload.school = data.school;
      if (data.interests?.length) payload.interests = data.interests;

      await completeOnboarding(payload);
      toast.success('Hồ sơ của bạn đã được thiết lập!');
      navigate('/', { replace: true });
    } catch {
      toast.error('Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStep = STEPS[step - 1];
  const StepIcon = currentStep.icon;

  return (
    <div className="flex min-h-[100dvh] bg-bg-primary transition-theme">
      <AuthBrandingPanel
        headline={<>Chào mừng,<br />bạn mới!</>}
        subtext="Hãy thiết lập hồ sơ của bạn để kết nối với những người bạn thú vị trên Smurfy."
      />

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 md:py-8 bg-bg-primary transition-theme h-[100dvh] overflow-hidden">
        <div className="w-full max-w-[460px] flex flex-col max-h-full animate-fade-in">
          
          <div className="flex-shrink-0">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src="/logo_text_blue.png" alt="Smurfy" className="h-9 object-contain" />
            </div>

            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                {STEPS.map((s) => (
                  <React.Fragment key={s.id}>
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300
                      ${s.id < step ? 'btn-gradient text-white shadow-sm' :
                        s.id === step ? 'btn-gradient text-white shadow-accent scale-110' :
                        'bg-bg-secondary text-text-tertiary border border-border-light'}
                    `}>
                      {s.id < step ? <CheckCircle size={14} /> : s.id}
                    </div>
                    {s.id < 3 && (
                      <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${s.id < step ? 'btn-gradient' : 'bg-bg-secondary'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <p className="text-xs text-text-tertiary">Bước {step}/3</p>
            </div>

            {/* Step header */}
            <div className="mb-4">
              <div className="relative w-14 h-14 mb-4">
                <div className="absolute inset-0 rounded-2xl btn-gradient opacity-20 blur-md" />
                <div className="relative w-14 h-14 btn-gradient rounded-2xl flex items-center justify-center shadow-sm">
                  <StepIcon size={26} className="text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-1">{currentStep.title}</h1>
              <p className="text-sm text-text-secondary">{currentStep.subtitle}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-hide min-h-0 py-2 px-2 -mx-2">
            {/* Step 1: Gender + DOB */}
            {step === 1 && (
              <div className="space-y-5">
                <SearchableSelect
                  label="Giới tính"
                  value={formData.gender || ''}
                  onChange={(val) => setValue('gender', val as Gender)}
                  options={GENDER_OPTIONS}
                  placeholder="Chọn giới tính"
                  searchPlaceholder="Tìm giới tính..."
                  size="lg"
                />
                <div>
                  <DatePicker
                    label="Ngày sinh"
                    value={formData.dob}
                    onChange={(ts) => setValue('dob', ts)}
                    placeholder="Chọn ngày sinh"
                    size="lg"
                    error={errors.dob?.message}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Location + School */}
            {step === 2 && (
              <div className="space-y-5">
                <SearchableSelect
                  label="Tỉnh/Thành phố"
                  value={formData.location || ''}
                  onChange={(val) => setValue('location', val)}
                  options={provinces}
                  placeholder="Chọn tỉnh/thành phố"
                  searchPlaceholder="Tìm tỉnh/thành phố..."
                  size="lg"
                />
                <SearchableSelect
                  label="Trường học / Nơi học"
                  value={formData.school || ''}
                  onChange={(val) => setValue('school', val)}
                  options={schoolOptions}
                  placeholder="Chọn hoặc tìm trường học"
                  searchPlaceholder="Tìm theo tên trường hoặc mã (VD: BKA)..."
                  error={errors.school?.message}
                  size="lg"
                />
              </div>
            )}

            {/* Step 3: Interests */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Tag input */}
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 ml-1">
                    Sở thích <span className="text-text-tertiary font-normal">({formData.interests?.length ?? 0}/10)</span>
                  </label>
                  <input
                    type="text"
                    value={interestInput}
                    onChange={e => setInterestInput(e.target.value)}
                    onKeyDown={handleInterestInput}
                    placeholder="Nhập sở thích rồi nhấn Enter..."
                    maxLength={30}
                    className="w-full px-4 py-3 text-sm rounded-xl border border-border-light bg-bg-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                {/* Suggestions */}
                <div>
                  <p className="text-xs text-text-tertiary mb-2">Gợi ý nhanh:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {INTEREST_SUGGESTIONS.filter(s => !(formData.interests ?? []).includes(s)).slice(0, 12).map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleAddInterest(tag)}
                        disabled={(formData.interests?.length ?? 0) >= 10}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border border-border-light text-text-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-150 disabled:opacity-40"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected tags */}
                {(formData.interests?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.interests?.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveInterest(tag)}
                          className="hover:opacity-60 transition-opacity"
                          aria-label={`Xóa ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 mt-6 pt-4 border-t border-border-light/40 space-y-3">
            {step < 3 ? (
              <Button
                fullWidth
                size="lg"
                onClick={handleNextStep}
                icon={<ArrowRight size={18} />}
              >
                Tiếp theo
              </Button>
            ) : (
              <Button
                fullWidth
                size="lg"
                onClick={handleSubmit(onSubmit)}
                isLoading={isSubmitting}
                icon={<CheckCircle size={18} />}
              >
                Hoàn tất & Bắt đầu
              </Button>
            )}

            <div className="flex items-center justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={15} />
                  Quay lại
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <SkipForward size={14} />
                Bỏ qua
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;

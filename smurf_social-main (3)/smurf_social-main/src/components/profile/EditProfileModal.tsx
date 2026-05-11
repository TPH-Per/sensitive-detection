import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Timestamp } from 'firebase/firestore';
import { X } from 'lucide-react';
import { User, Gender, MaritalStatus, Generation } from '../../../shared/types';
import { Button, Input, TextArea, Select, DatePicker, Modal, SearchableSelect } from '../ui';
import type { SearchableOption } from '../ui/SearchableSelect';
import { toDate } from '../../utils/dateUtils';
import { toast } from '../../store/toastStore';
import { API_ENDPOINTS, TOAST_MESSAGES, VALIDATION } from '../../constants';
import { profileSchema, ProfileFormValues } from '../../utils/validation';
import { calculateGeneration } from '../../utils/userUtils';
import schoolsData from '../../assets/data/schools.json';
import ProfilePrivacySelector from './ProfilePrivacySelector';
import { Visibility, ProfilePrivacy } from '../../../shared/types';

interface EditProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<User>) => Promise<void>;
}

const MARITAL_STATUS_OPTIONS = [
  { value: MaritalStatus.NONE, label: 'Không muốn nói' },
  { value: MaritalStatus.SINGLE, label: 'Độc thân' },
  { value: MaritalStatus.MARRIED, label: 'Đã kết hôn' },
  { value: MaritalStatus.DIVORCED, label: 'Đã ly hôn' },
  { value: MaritalStatus.WIDOWED, label: 'Góa' },
  { value: MaritalStatus.OTHER, label: 'Khác' },
];



export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  user, isOpen, onClose, onSave,
}) => {
  const [saving, setSaving] = useState(false);
  const [provinces, setProvinces] = useState<SearchableOption[]>([]);

  // Chuyển schools.json thành options một lần duy nhất
  const schoolOptions = useMemo<SearchableOption[]>(() =>
    schoolsData.map(s => ({ value: s.name, label: s.name, code: s.code })),
    []
  );
  const [interestInput, setInterestInput] = useState('');

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user.fullName,
      bio: user.bio || '',
      location: user.location || '',
      gender: user.gender as Gender,
      dob: user.dob ? toDate(user.dob)?.getTime() : undefined,
      school: user.school || '',
      maritalStatus: user.maritalStatus,
      interests: user.interests || [],
      generation: user.generation || Generation.UNKNOWN,
      profilePrivacy: user.profilePrivacy || {
        email: Visibility.PRIVATE,
        dob: Visibility.FRIENDS,
        gender: Visibility.FRIENDS,
        location: Visibility.FRIENDS,
        school: Visibility.FRIENDS,
        maritalStatus: Visibility.FRIENDS,
      },
    },
  });

  const formData = watch();

  useEffect(() => {
    if (!isOpen) return;
    reset({
      fullName: user.fullName,
      bio: user.bio || '',
      location: user.location || '',
      gender: user.gender as Gender,
      dob: user.dob ? toDate(user.dob)?.getTime() : undefined,
      school: user.school || '',
      maritalStatus: user.maritalStatus,
      interests: user.interests || [],
      generation: user.generation || Generation.UNKNOWN,
      profilePrivacy: user.profilePrivacy || {
        email: Visibility.PRIVATE,
        dob: Visibility.FRIENDS,
        gender: Visibility.FRIENDS,
        location: Visibility.FRIENDS,
        school: Visibility.FRIENDS,
        maritalStatus: Visibility.FRIENDS,
      },
    });
    setInterestInput('');
    fetch(API_ENDPOINTS.PROVINCES)
      .then(r => r.json())
      .then((data: { name: string }[]) =>
        setProvinces(data.map(p => ({ value: p.name, label: p.name })))
      )
      .catch(() => { /* silent */ });
  }, [isOpen, user, reset]);

  const handleAddInterest = useCallback(() => {
    const tag = interestInput.trim();
    if (!tag) return;
    const current = formData.interests ?? [];
    if (current.includes(tag) || current.length >= VALIDATION.INTEREST_MAX_COUNT) return;
    setValue('interests', [...current, tag], { shouldDirty: true });
    setInterestInput('');
  }, [interestInput, formData.interests, setValue]);

  const handleRemoveInterest = useCallback((tag: string) => {
    setValue(
      'interests',
      (formData.interests ?? []).filter(t => t !== tag),
      { shouldDirty: true }
    );
  }, [formData.interests, setValue]);

  const handleInterestKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddInterest();
    }
  }, [handleAddInterest]);

  const handleSave = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      const payload: Partial<User> = {
        fullName: data.fullName,
        bio: data.bio,
        location: data.location,
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.dob !== undefined && { dob: Timestamp.fromDate(new Date(data.dob)) }),
        ...(data.school ? { school: data.school } : { school: '' }),
        ...(data.maritalStatus !== undefined && { maritalStatus: data.maritalStatus }),
        interests: data.interests?.length ? data.interests : [],
        ...(data.generation ? { generation: data.generation } : { generation: Generation.UNKNOWN }),
        profilePrivacy: data.profilePrivacy,
      };
      await onSave(payload);
      toast.success(TOAST_MESSAGES.PROFILE.UPDATE_SUCCESS);
      onClose();
    } catch {
      toast.error(TOAST_MESSAGES.PROFILE.UPDATE_FAILED);
    } finally {
      setSaving(false);
    }
  };

  const FieldWrapper: React.FC<{ label: string; privacyKey: keyof ProfilePrivacy; children: React.ReactNode; required?: boolean }> = ({ label, privacyKey, children, required }) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center px-1">
        <label className="text-xs font-semibold text-text-secondary cursor-pointer">
          {label} {required && '*'}
        </label>
        <ProfilePrivacySelector
          value={formData.profilePrivacy?.[privacyKey] || Visibility.FRIENDS}
          onChange={(val) => setValue('profilePrivacy', { ...formData.profilePrivacy, [privacyKey]: val } as any, { shouldDirty: true })}
        />
      </div>
      {children}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chỉnh sửa trang cá nhân"
      maxWidth="2xl"
      fullScreen="mobile"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(handleSave)}
            isLoading={saving}
            disabled={saving || !isDirty}
          >
            Lưu thay đổi
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Full name */}
          <div className="col-span-1 sm:col-span-2">
            <Input
              label="Tên hiển thị *"
              {...register('fullName')}
              error={errors.fullName?.message}
              placeholder="Nhập họ và tên"
              size="lg"
            />
          </div>

          <div className="col-span-1 sm:col-span-2">
            <TextArea
              label="Giới thiệu"
              {...register('bio')}
              onChange={(e) =>
                setValue('bio', e.target.value.slice(0, VALIDATION.BIO_MAX_LENGTH), { shouldDirty: true })
              }
              error={errors.bio?.message}
              placeholder="Nhập vài dòng giới thiệu về bản thân..."
              rows={2}
              rightElement={
                <div className="text-xs text-text-tertiary pr-2 pb-2 pointer-events-none">
                  {formData.bio?.length || 0}/{VALIDATION.BIO_MAX_LENGTH}
                </div>
              }
            />
          </div>

          <div>
            <FieldWrapper label="Email" privacyKey="email">
              <Input value={user.email || ''} disabled size="lg" />
            </FieldWrapper>
          </div>

          <div>
            <FieldWrapper label="Tỉnh/Thành phố" privacyKey="location">
              <SearchableSelect
                value={formData.location || ''}
                onChange={(val) => setValue('location', val, { shouldDirty: true })}
                options={provinces}
                placeholder="Chọn tỉnh/thành phố"
                searchPlaceholder="Tìm tỉnh/thành phố..."
                size="lg"
              />
            </FieldWrapper>
          </div>

          <div>
            <FieldWrapper label="Giới tính" privacyKey="gender">
              <Select
                value={formData.gender || ''}
                onChange={(val) => setValue('gender', val as Gender, { shouldDirty: true })}
                options={[
                  { value: 'male', label: 'Nam' },
                  { value: 'female', label: 'Nữ' },
                ]}
                placeholder="Chọn giới tính"
                size="lg"
              />
            </FieldWrapper>
          </div>

          <div>
            <FieldWrapper label="Ngày sinh" privacyKey="dob">
              <DatePicker
                value={formData.dob}
                onChange={(ts) => {
                  setValue('dob', ts, { shouldDirty: true });
                  if (ts) {
                    const gen = calculateGeneration(ts);
                    setValue('generation', gen, { shouldDirty: true });
                  }
                }}
                placeholder="Chọn ngày sinh"
                size="lg"
                error={errors.dob?.message}
              />
            </FieldWrapper>
          </div>



          <div>
            <FieldWrapper label="Tình trạng hôn nhân" privacyKey="maritalStatus">
              <Select
                value={formData.maritalStatus || ''}
                onChange={(val) => setValue('maritalStatus', val as MaritalStatus, { shouldDirty: true })}
                options={MARITAL_STATUS_OPTIONS}
                placeholder="Chọn tình trạng"
                size="lg"
              />
            </FieldWrapper>
          </div>

          <div className="col-span-1 sm:col-span-2">
            <FieldWrapper label="Trường học / Nơi học" privacyKey="school">
              <SearchableSelect
                value={formData.school || ''}
                onChange={(val) => setValue('school', val, { shouldDirty: true })}
                options={schoolOptions}
                placeholder="Chọn hoặc tìm trường học"
                searchPlaceholder="Tìm theo tên trường hoặc mã (VD: BKA)..."
                error={errors.school?.message}
                size="lg"
              />
            </FieldWrapper>
          </div>

          <div className="col-span-1 sm:col-span-2">
            <label className="text-xs font-semibold text-text-secondary px-1">
              Sở thích (tối đa {VALIDATION.INTEREST_MAX_COUNT})
            </label>
            <div className="flex gap-2 mt-1.5">
              <input
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={handleInterestKeyDown}
                placeholder="Nhập sở thích rồi nhấn Enter..."
                maxLength={VALIDATION.INTEREST_MAX_LENGTH}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-border-light bg-bg-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleAddInterest}
                disabled={(formData.interests?.length ?? 0) >= VALIDATION.INTEREST_MAX_COUNT}
              >
                Thêm
              </Button>
            </div>
            {(formData.interests?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formData.interests?.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveInterest(tag)}
                      className="hover:text-primary/60 transition-colors"
                      aria-label={`Xóa ${tag}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

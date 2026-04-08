import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Timestamp } from 'firebase/firestore';
import { X } from 'lucide-react';
import { User, Gender, MaritalStatus } from '../../../shared/types';
import { Button, Input, TextArea, Select, DatePicker, Modal, SearchableSelect } from '../ui';
import type { SearchableOption } from '../ui/SearchableSelect';
import { toDate } from '../../utils/dateUtils';
import { toast } from '../../store/toastStore';
import { API_ENDPOINTS, TOAST_MESSAGES } from '../../constants';
import { profileSchema, ProfileFormValues } from '../../utils/validation';
import schoolsData from '../../assets/data/schools.json';

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

const GENERATION_OPTIONS = [
  { value: '', label: 'Chưa xác định' },
  { value: 'Gen Z', label: 'Gen Z (1997-2012)' },
  { value: 'Millennials', label: 'Millennials (1981-1996)' },
  { value: 'Gen X', label: 'Gen X (1965-1980)' },
  { value: 'Baby Boomers', label: 'Boomer (Trước 1965)' },
  { value: 'Gen Alpha', label: 'Gen Alpha (Từ 2013)' },
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
      generation: user.generation || '',
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
      generation: user.generation || '',
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
    if (current.includes(tag) || current.length >= 10) return;
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
        ...(data.generation ? { generation: data.generation } : { generation: '' }),
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

          {/* Bio */}
          <div className="col-span-1 sm:col-span-2">
            <TextArea
              label="Giới thiệu"
              {...register('bio')}
              onChange={(e) =>
                setValue('bio', e.target.value.slice(0, 150), { shouldDirty: true })
              }
              error={errors.bio?.message}
              placeholder="Nhập vài dòng giới thiệu về bản thân..."
              rows={2}
              rightElement={
                <div className="text-xs text-text-tertiary pr-2 pb-2 pointer-events-none">
                  {formData.bio?.length || 0}/150
                </div>
              }
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <Input label="Email" value={user.email || ''} disabled size="lg" />
          </div>

          {/* Province */}
          <div>
            <SearchableSelect
              label="Tỉnh/Thành phố"
              value={formData.location || ''}
              onChange={(val) => setValue('location', val, { shouldDirty: true })}
              options={provinces}
              placeholder="Chọn tỉnh/thành phố"
              searchPlaceholder="Tìm tỉnh/thành phố..."
              size="lg"
            />
          </div>

          {/* Gender */}
          <div>
            <Select
              label="Giới tính"
              value={formData.gender || ''}
              onChange={(val) => setValue('gender', val as Gender, { shouldDirty: true })}
              options={[
                { value: 'male', label: 'Nam' },
                { value: 'female', label: 'Nữ' },
              ]}
              placeholder="Chọn giới tính"
              size="lg"
            />
          </div>

          {/* DOB */}
          <div>
            <DatePicker
              label="Ngày sinh"
              value={formData.dob}
              onChange={(ts) => setValue('dob', ts, { shouldDirty: true })}
              placeholder="Chọn ngày sinh"
              size="lg"
            />
          </div>

          {/* School */}
          <div>
            <SearchableSelect
              label="Trường học / Nơi học"
              value={formData.school || ''}
              onChange={(val) => setValue('school', val, { shouldDirty: true })}
              options={schoolOptions}
              placeholder="Chọn hoặc tìm trường học"
              searchPlaceholder="Tìm theo tên trường hoặc mã (VD: BKA)..."
              error={errors.school?.message}
              size="lg"
            />
          </div>

          {/* Marital status */}
          <div>
            <Select
              label="Tình trạng hôn nhân"
              value={formData.maritalStatus || ''}
              onChange={(val) => setValue('maritalStatus', val as MaritalStatus, { shouldDirty: true })}
              options={MARITAL_STATUS_OPTIONS}
              placeholder="Chọn tình trạng"
              size="lg"
            />
          </div>

          {/* Generation */}
          <div>
            <Select
              label="Thế hệ"
              value={formData.generation || ''}
              onChange={(val) => setValue('generation', val, { shouldDirty: true })}
              options={GENERATION_OPTIONS}
              placeholder="Chọn thế hệ"
              size="lg"
            />
          </div>

          {/* Interests */}
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Sở thích <span className="text-text-tertiary font-normal">(tối đa 10)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={handleInterestKeyDown}
                placeholder="Nhập sở thích rồi nhấn Enter..."
                maxLength={30}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-border-light bg-bg-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleAddInterest}
                disabled={(formData.interests?.length ?? 0) >= 10}
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

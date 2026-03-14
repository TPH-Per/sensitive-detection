import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Timestamp } from 'firebase/firestore';
import { User, Gender } from '../../types';
import { Button, Input, TextArea, Select, DatePicker, Modal } from '../ui';
import { toDate } from '../../utils/dateUtils';
import { toast } from '../../store/toastStore';
import { API_ENDPOINTS, TOAST_MESSAGES } from '../../constants';
import { profileSchema, ProfileFormValues } from '../../utils/validation';

interface EditProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<User>) => Promise<void>;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave
}) => {
  const [saving, setSaving] = useState(false);
  const [provinces, setProvinces] = useState<{ value: string, label: string }[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty }
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user.fullName,
      bio: user.bio || '',
      location: user.location || '',
      gender: user.gender as Gender | "",
      dob: user.dob ? toDate(user.dob)?.getTime() : undefined
    }
  });

  const formData = watch();

  useEffect(() => {
    if (isOpen) {
      reset({
        fullName: user.fullName,
        bio: user.bio || '',
        location: user.location || '',
        gender: user.gender as Gender | "",
        dob: user.dob ? toDate(user.dob)?.getTime() : undefined
      });
      fetchProvinces();
    }
  }, [isOpen, user, reset]);

  const fetchProvinces = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.PROVINCES);
      const data = await response.json();
      setProvinces(data.map((p: { name: string }) => ({ value: p.name, label: p.name })));
    } catch (error) {
      console.error('Không thể tải danh sách tỉnh/thành phố', error);
    }
  };

  const handleSave = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      await onSave({
        fullName: data.fullName,
        bio: data.bio,
        location: data.location,
        gender: data.gender,
        dob: data.dob ? Timestamp.fromDate(new Date(data.dob)) : undefined
      });
      toast.success(TOAST_MESSAGES.PROFILE.UPDATE_SUCCESS);
      onClose();
    } catch (error) {
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
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(handleSave as any)}
            disabled={saving || !isDirty}
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <h3 className="font-semibold mb-3 text-text-primary">Thông tin chung</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <Input
                label="Tên hiển thị *"
                {...register('fullName')}
                error={errors.fullName?.message}
                placeholder="Nhập họ và tên"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <TextArea
                label="Giới thiệu"
                {...register('bio')}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 150);
                  setValue('bio', val, { shouldDirty: true });
                }}
                error={errors.bio?.message}
                placeholder="Nhập vài dòng giới thiệu về bản thân..."
                rows={2}
                className="rounded-xl"
                rightElement={
                  <div className="text-xs text-text-secondary pr-1.5 pb-2 pointer-events-none">
                    {formData.bio?.length || 0}/150
                  </div>
                }
              />
            </div>

            <div>
              <Input
                label="Email"
                value={user.email || ''}
                disabled
              />
            </div>

            <div>
              <Select
                label="Tỉnh/Thành phố"
                value={formData.location || ''}
                onChange={(val) => setValue('location', val, { shouldDirty: true })}
                options={provinces}
                placeholder="Chọn tỉnh/thành phố"
                openUp
              />
            </div>

            <div>
              <Select
                label="Giới tính"
                value={formData.gender || ''}
                onChange={(val) => setValue('gender', val as Gender | "", { shouldDirty: true })}
                options={[
                  { value: 'male', label: 'Nam' },
                  { value: 'female', label: 'Nữ' }
                ]}
                placeholder="Chọn giới tính"
              />
            </div>

            <div>
              <DatePicker
                label="Ngày sinh"
                value={formData.dob}
                onChange={(ts) => setValue('dob', ts, { shouldDirty: true })}
                placeholder="Chọn ngày sinh"
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

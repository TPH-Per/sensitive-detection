import React, { useState, useEffect } from 'react';
import { X, Search, Users, Camera, Check, Loader2, Crown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User } from '../../../../shared/types';
import { userService } from '../../../services/userService';
import { friendService } from '../../../services/friendService';
import { useAuthStore } from '../../../store/authStore';
import { Modal, Input, Button, Avatar, UserAvatar, IconButton, ImageCropper } from '../../ui';
import { groupSchema, GroupFormValues } from '../../../utils/validation';
import { validateFileSize } from '../../../utils';
import { toast } from '../../../store/toastStore';
import { GROUP_LIMITS } from '../../../constants';

interface CreateGroupModalProps {
  isOpen: boolean;
  currentUserId: string;
  onClose: () => void;
  onCreateGroup: (memberIds: string[], groupName: string, groupAvatar?: File) => Promise<void>;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  currentUserId,
  onClose,
  onCreateGroup
}) => {
  const [step, setStep] = useState<'select' | 'details'>('select');
  const [searchTerm, setSearchTerm] = useState('');
  const [friends, setFriends] = useState<User[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: '',
      memberIds: []
    }
  });

  const formData = watch();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFriends();
      setStep('select');
      setSearchTerm('');
      setPreviewUrl(null);
      setPendingFile(null);
      reset({
        name: '',
        memberIds: []
      });
    }
  }, [isOpen, reset]);

  const loadFriends = async () => {
    setIsLoading(true);
    try {
      const friendsList = await friendService.getAllFriends(currentUserId);
      setFriends(friendsList);
    } catch (error) {
      console.error('Lỗi load friends', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFileSize(file, 'AVATAR');
      if (!validation.isValid) {
        if (validation.error) toast.error(validation.error);
        return;
      }
      const url = URL.createObjectURL(file);
      setCropImage(url);
      setShowCropper(true);
    }
    e.target.value = '';
  };

  const handleCropComplete = (croppedFile: File) => {
    const url = URL.createObjectURL(croppedFile);
    setPreviewUrl(url);
    setPendingFile(croppedFile);
    setShowCropper(false);
    if (cropImage) {
      URL.revokeObjectURL(cropImage);
    }
    setCropImage(null);
  };

  const handleCropCancel = () => {
    if (cropImage) {
      URL.revokeObjectURL(cropImage);
    }
    setCropImage(null);
    setShowCropper(false);
  };

  const toggleSelect = (userId: string) => {
    const currentIds = formData.memberIds;

    // Kiểm tra giới hạn số thành viên tối đa
    if (!currentIds.includes(userId) && currentIds.length >= GROUP_LIMITS.MAX_MEMBERS - 1) {
      toast.error(`Nhóm tối đa ${GROUP_LIMITS.MAX_MEMBERS} thành viên`);
      return;
    }

    const newIds = currentIds.includes(userId)
      ? currentIds.filter(id => id !== userId)
      : [...currentIds, userId];

    setValue('memberIds', newIds, { shouldValidate: step === 'select' });
  };

  const handleNext = () => {
    if (formData.memberIds.length < GROUP_LIMITS.MIN_MEMBERS) return;

    // Tự động tạo tên nhóm từ tên thành viên (bao gồm người tạo)
    const { user: currentUser } = useAuthStore.getState();
    const selectedFriends = friends.filter(f => formData.memberIds.includes(f.id));
    const allNames = [
      currentUser?.fullName.split(' ')[0] || 'Bạn',
      ...selectedFriends.map(f => f.fullName.split(' ')[0])
    ];
    const autoName = allNames.join(', ');
    setValue('name', autoName);
    setStep('details');
  };

  const onFormSubmit = async (data: GroupFormValues) => {
    try {
      await onCreateGroup(data.memberIds, data.name.trim(), pendingFile || undefined);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      onClose();
    } catch (error) {
      console.error('Lỗi tạo group', error);
    }
  };

  const filteredFriends = friends.filter(f =>
    f.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSelectStep = () => (
    <div className="flex flex-col min-h-0">
      <div className="flex-none mb-4">
        <Input
          icon={<Search size={16} />}
          placeholder="Tìm kiếm bạn bè..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-bg-secondary"
        />
      </div>

      {formData.memberIds.length > 0 && (
        <div className="flex-none flex flex-wrap gap-2 mb-4 p-3 bg-bg-secondary rounded-xl max-h-[120px] overflow-y-auto custom-scrollbar">
          {formData.memberIds.map(id => {
            const friend = friends.find(f => f.id === id);
            if (!friend) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-2 bg-primary-light text-primary px-3 py-1.5 rounded-full text-sm"
              >
                <span>{friend.fullName.split(' ')[0]}</span>
                <IconButton
                  onClick={() => toggleSelect(id)}
                  className="hover:bg-primary/20"
                  icon={<X size={14} />}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1 -mr-2 pr-2 custom-scrollbar min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary" size={24} />
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary">
            {searchTerm ? 'Không tìm thấy bạn bè' : 'Bạn chưa có bạn bè nào'}
          </div>
        ) : (
          filteredFriends.map(friend => (
            <div
              key={friend.id}
              onClick={() => toggleSelect(friend.id)}
              className={`
                flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all
                ${formData.memberIds.includes(friend.id)
                  ? 'bg-primary-light'
                  : 'hover:bg-bg-hover'
                }
              `}
            >
              <UserAvatar
                userId={friend.id}
                size="sm"
              />
              <span className="flex-1 text-sm font-medium text-text-primary">
                {friend.fullName}
              </span>
              {formData.memberIds.includes(friend.id) && (
                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {errors.memberIds && (
        <p className="text-xs text-error mt-2">{errors.memberIds.message}</p>
      )}
    </div>
  );

  const renderDetailsStep = () => {
    const { user: currentUser } = useAuthStore.getState();
    const totalMembers = formData.memberIds.length + 1; // +1 cho người tạo

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-20 h-20 bg-primary-light rounded-full flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <Users size={32} className="text-primary" />
              )}
            </div>
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 bg-primary text-white hover:bg-primary-dark shadow-sm border-2 border-bg-primary"
              icon={<Camera size={14} />}
              size="sm"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <p className="text-sm text-text-secondary mt-2">
            Nhóm với {totalMembers} thành viên (bao gồm bạn)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Tên nhóm
          </label>
          <Input
            placeholder="Nhập tên nhóm..."
            {...register('name')}
            error={errors.name?.message}
            size="md"
            className="bg-bg-secondary"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-text-secondary mb-2">
            Thành viên ({totalMembers})
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Hiển thị người tạo (bạn) */}
            {currentUser && (
              <div className="flex items-center gap-2 bg-primary-light px-3 py-2 rounded-lg border border-primary/30">
                <Avatar src={currentUser.avatar.url} name={currentUser.fullName} size="xs" />
                <span className="text-sm text-primary font-medium">{currentUser.fullName}</span>
                <Crown size={12} className="text-primary" />
              </div>
            )}
            {/* Hiển thị các thành viên đã chọn */}
            {formData.memberIds.map(id => {
              const friend = friends.find(f => f.id === id);
              if (!friend) return null;
              return (
                <div key={id} className="flex items-center gap-2 bg-bg-secondary px-3 py-2 rounded-lg">
                  <Avatar src={friend.avatar.url} name={friend.fullName} size="xs" />
                  <span className="text-sm text-text-primary">{friend.fullName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={step === 'select' ? 'Tạo nhóm mới' : 'Thông tin nhóm'}
        maxWidth="md"
        footer={
          <div className="flex gap-3">
            {step === 'details' && (
              <Button
                variant="secondary"
                onClick={() => setStep('select')}
                disabled={isSubmitting}
              >
                Quay lại
              </Button>
            )}
            {step === 'select' ? (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={formData.memberIds.length < GROUP_LIMITS.MIN_MEMBERS}
              >
                Tiếp tục ({formData.memberIds.length}/{GROUP_LIMITS.MAX_MEMBERS - 1})
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSubmit(onFormSubmit)}
                disabled={isSubmitting}
                isLoading={isSubmitting}
              >
                Tạo nhóm
              </Button>
            )}
          </div>
        }
      >
        {step === 'select' ? renderSelectStep() : renderDetailsStep()}
      </Modal>

      {showCropper && cropImage && (
        <ImageCropper
          isOpen={showCropper}
          image={cropImage}
          aspect={1}
          title="Cắt ảnh nhóm"
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
};

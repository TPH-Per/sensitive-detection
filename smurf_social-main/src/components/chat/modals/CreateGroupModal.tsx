import React, { useState, useEffect } from 'react';
import { X, Search, Users, Camera, Check, Loader2, Crown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User } from '../../../../shared/types';
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
  isOpen, currentUserId, onClose, onCreateGroup,
}) => {
  const [step, setStep] = useState<'select' | 'details'>('select');
  const [searchTerm, setSearchTerm] = useState('');
  const [friends, setFriends] = useState<User[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: '', memberIds: [] },
  });

  const formData = watch();

  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setSearchTerm('');
    setPreviewUrl(null);
    setPendingFile(null);
    reset({ name: '', memberIds: [] });
    setIsLoading(true);
    friendService.getAllFriends(currentUserId)
      .then(setFriends)
      .catch(() => { })
      .finally(() => setIsLoading(false));
  }, [isOpen, reset]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { toast.error('Chỉ hỗ trợ file ảnh'); e.target.value = ''; return; }
      const validation = validateFileSize(file, 'AVATAR');
      if (!validation.isValid) { if (validation.error) toast.error(validation.error); return; }
      setCropImage(URL.createObjectURL(file));
      setShowCropper(true);
    }
    e.target.value = '';
  };

  const handleCropComplete = (croppedFile: File) => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setPendingFile(croppedFile);
    setShowCropper(false);
    setCropImage(null);
  };

  const handleCropCancel = () => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
    setShowCropper(false);
  };

  const toggleSelect = (userId: string) => {
    const currentIds = formData.memberIds;
    if (!currentIds.includes(userId) && currentIds.length >= GROUP_LIMITS.MAX_MEMBERS - 1) {
      toast.error(`Nhóm tối đa ${GROUP_LIMITS.MAX_MEMBERS} thành viên`);
      return;
    }
    setValue(
      'memberIds',
      currentIds.includes(userId)
        ? currentIds.filter(id => id !== userId)
        : [...currentIds, userId],
      { shouldValidate: step === 'select' }
    );
  };

  const handleNext = () => {
    if (formData.memberIds.length < GROUP_LIMITS.MIN_MEMBERS) return;
    const { user: currentUser } = useAuthStore.getState();
    const selectedFriends = friends.filter(f => formData.memberIds.includes(f.id));
    const allNames = [
      currentUser?.fullName.split(' ')[0] || 'Bạn',
      ...selectedFriends.map(f => f.fullName.split(' ')[0]),
    ];
    setValue('name', allNames.join(', '));
    setStep('details');
  };

  const onFormSubmit = async (data: GroupFormValues) => {
    try {
      await onCreateGroup(data.memberIds, data.name.trim(), pendingFile || undefined);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onClose();
    } catch {
      // silent
    }
  };

  const filteredFriends = friends.filter(f =>
    f.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ── Step 1: Select members ── */
  const renderSelectStep = () => (
    <div className="flex flex-col gap-4 min-h-0">
      <Input
        icon={<Search size={15} />}
        placeholder="Tìm kiếm bạn bè..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-bg-secondary"
      />

      {/* Selected chips */}
      {formData.memberIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 bg-bg-secondary rounded-xl max-h-[100px] overflow-y-auto scroll-hide">
          {formData.memberIds.map(id => {
            const friend = friends.find(f => f.id === id);
            if (!friend) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium"
              >
                <span>{friend.fullName.split(' ')[0]}</span>
                <button
                  type="button"
                  onClick={() => toggleSelect(id)}
                  className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Friend list */}
      <div className="overflow-y-auto scroll-hide min-h-0 max-h-64 space-y-0.5">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary" size={22} />
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="text-center py-8 text-sm text-text-tertiary">
            {searchTerm ? 'Không tìm thấy bạn bè' : 'Bạn chưa có bạn bè nào'}
          </div>
        ) : (
          filteredFriends.map(friend => {
            const isSelected = formData.memberIds.includes(friend.id);
            return (
              <div
                key={friend.id}
                onClick={() => toggleSelect(friend.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-200
                  ${isSelected ? 'bg-primary/10' : 'hover:bg-bg-hover'}`}
              >
                <UserAvatar userId={friend.id} size="sm" />
                <span className="flex-1 text-sm font-medium text-text-primary truncate">
                  {friend.fullName}
                </span>
                {isSelected && (
                  <div className="w-5 h-5 btn-gradient rounded-full flex items-center justify-center flex-shrink-0">
                    <Check size={11} className="text-white" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {errors.memberIds && (
        <p className="text-xs text-error">{errors.memberIds.message}</p>
      )}
    </div>
  );

  /* ── Step 2: Group details ── */
  const renderDetailsStep = () => {
    const { user: currentUser } = useAuthStore.getState();
    const totalMembers = formData.memberIds.length + 1;
    return (
      <div className="space-y-5">
        {/* Avatar picker */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
              {previewUrl
                ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                : <Users size={30} className="text-primary" />
              }
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 btn-gradient rounded-full flex items-center justify-center shadow-accent border-2 border-bg-primary"
            >
              <Camera size={13} className="text-white" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            Nhóm với {totalMembers} thành viên (bao gồm bạn)
          </p>
        </div>

        {/* Group name */}
        <Input
          label="Tên nhóm"
          placeholder="Nhập tên nhóm..."
          {...register('name')}
          error={errors.name?.message}
          className="bg-bg-secondary"
        />

        {/* Member chips */}
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-2">
            Thành viên ({totalMembers})
          </p>
          <div className="flex flex-wrap gap-2">
            {currentUser && (
              <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20">
                <Avatar src={currentUser.avatar?.url} name={currentUser.fullName} size="xs" />
                <span className="text-xs text-primary font-medium">{currentUser.fullName}</span>
                <Crown size={11} className="text-primary" />
              </div>
            )}
            {formData.memberIds.map(id => {
              const friend = friends.find(f => f.id === id);
              if (!friend) return null;
              return (
                <div key={id} className="flex items-center gap-2 bg-bg-secondary px-3 py-1.5 rounded-xl border border-border-light">
                  <Avatar src={friend.avatar?.url} name={friend.fullName} size="xs" />
                  <span className="text-xs text-text-primary">{friend.fullName}</span>
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
        fullScreen="mobile"
        footer={
          <div className="flex gap-3">
            {step === 'details' && (
              <Button variant="secondary" onClick={() => setStep('select')} disabled={isSubmitting}>
                Quay lại
              </Button>
            )}
            {step === 'select' ? (
              <Button
                onClick={handleNext}
                disabled={formData.memberIds.length < GROUP_LIMITS.MIN_MEMBERS}
              >
                Tiếp tục ({formData.memberIds.length}/{GROUP_LIMITS.MAX_MEMBERS - 1})
              </Button>
            ) : (
              <Button
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
          showShareOption={false}
        />
      )}
    </>
  );
};

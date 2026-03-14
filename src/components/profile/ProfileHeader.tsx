import React, { useRef, useState } from 'react';
import { Users, MessageCircle, UserPlus, UserCheck, Edit, Trash2, Pencil, Settings, MoreHorizontal, Flag, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { User, ReportType } from '../../types';
import { FriendStatus } from '../../types';
import { UserAvatar, Button, Dropdown, DropdownItem, ImageCropper, LazyImage, CircularProgress } from '../ui';
import { toast } from '../../store/toastStore';
import { Image as ImageIcon } from 'lucide-react';
import { useReportStore } from '../../store/reportStore';
import { validateFileSize } from '../../utils/uploadUtils';

interface ProfileHeaderProps {
  user: User;
  isOwnProfile: boolean;
  friendStatus?: FriendStatus;
  onEditClick?: () => void;
  onMessageClick?: () => void;
  onFriendClick?: () => void;
  onAvatarChange?: (file: File, shareToFeed: boolean) => void;
  onCoverChange?: (file: File, shareToFeed: boolean) => void;
  onAvatarDelete?: () => void;
  onCoverDelete?: () => void;
  onBlockClick?: () => void;
  onUnblockClick?: () => void;
  isBlockedByMe?: boolean;
  uploading?: boolean;
  uploadProgress?: number;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user,
  isOwnProfile,
  friendStatus = FriendStatus.NOT_FRIEND,
  onEditClick,
  onMessageClick,
  onFriendClick,
  onAvatarChange,
  onCoverChange,
  onAvatarDelete,
  onCoverDelete,
  onBlockClick,
  onUnblockClick,
  isBlockedByMe = false,
  uploading = false,
  uploadProgress
}) => {
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { openReportModal } = useReportStore();

  // State cho crop modal
  const [cropState, setCropState] = useState<{
    isOpen: boolean;
    type: 'avatar' | 'cover';
    image: string;
  } | null>(null);

  const handleAvatarClick = () => {
    if (isOwnProfile && !uploading) {
      avatarInputRef.current?.click();
    }
  };

  const handleCoverClick = () => {
    if (isOwnProfile && !uploading) {
      coverInputRef.current?.click();
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFileSize(file, 'AVATAR');
      if (!validation.isValid) {
        if (validation.error) toast.error(validation.error);
        return;
      }
      const blobUrl = URL.createObjectURL(file);
      setCropState({ isOpen: true, type: 'avatar', image: blobUrl });
    }
    e.target.value = '';
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFileSize(file, 'COVER');
      if (!validation.isValid) {
        if (validation.error) toast.error(validation.error);
        return;
      }
      const blobUrl = URL.createObjectURL(file);
      setCropState({ isOpen: true, type: 'cover', image: blobUrl });
    }
    e.target.value = '';
  };

  const handleCropComplete = (croppedFile: File, shouldShare: boolean) => {
    if (cropState?.type === 'avatar' && onAvatarChange) {
      onAvatarChange(croppedFile, shouldShare);
    } else if (cropState?.type === 'cover' && onCoverChange) {
      onCoverChange(croppedFile, shouldShare);
    }

    if (cropState?.image) {
      URL.revokeObjectURL(cropState.image);
    }
    setCropState(null);
  };

  const handleCropCancel = () => {
    if (cropState?.image) {
      URL.revokeObjectURL(cropState.image);
    }
    setCropState(null);
  };

  const handleImageChange = (file: File) => {
    if (!cropState) return;

    const type = cropState.type === 'avatar' ? 'AVATAR' : 'COVER';
    const validation = validateFileSize(file, type);
    if (!validation.isValid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    // Cleanup cũ
    if (cropState.image) {
      URL.revokeObjectURL(cropState.image);
    }

    const blobUrl = URL.createObjectURL(file);
    setCropState({ ...cropState, image: blobUrl });
  };

  return (
    <>
      <div className="max-w-5xl mx-auto">
        {/* Cover */}
        <div className="relative h-[200px] md:h-[320px] w-full md:rounded-b-2xl shadow-sm">
          {/* Background Image Layer */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-active md:rounded-b-2xl overflow-hidden">
            <LazyImage
              src={user.cover?.url || '/cover-image.jpg'}
              className="w-full h-full object-cover transition-all duration-base"
              alt="Cover"
            />
          </div>

          {isOwnProfile && (
            <div className="absolute bottom-4 right-4 z-10">
              <Dropdown
                trigger={
                  <Button
                    isLoading={uploading}
                    variant="ghost"
                    className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 hover:!text-white transition-all gap-2 border border-white/20 rounded-xl"
                    icon={<Pencil size={18} />}
                  >
                    <span className="hidden md:inline">Chỉnh sửa ảnh bìa</span>
                  </Button>
                }
                align="right"
              >
                <DropdownItem
                  icon={<ImageIcon size={16} />}
                  label="Tải ảnh lên"
                  onClick={handleCoverClick}
                />
                {user.cover?.url && (
                  <DropdownItem
                    icon={<Trash2 size={16} />}
                    label="Xóa ảnh bìa"
                    variant="danger"
                    onClick={onCoverDelete || (() => { })}
                  />
                )}
              </Dropdown>
            </div>
          )}

          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverFileChange}
            className="hidden"
          />
        </div>

        {/* Profile Info */}
        <div className="px-4">
          <div className="relative pb-0 transition-theme">
            <div className="flex flex-col md:flex-row items-center md:items-end text-center md:text-left gap-6 pb-6 mt-2">

              {/* Avatar */}
              <div className="relative group -mt-16 md:-mt-20 z-20 mx-auto md:mx-0">
                <div className="relative">
                  <div className="p-1 bg-bg-primary rounded-full transition-theme">
                    <UserAvatar
                      userId={user.id}
                      src={user.avatar.url}
                      name={user.fullName}
                      size="2xl"
                      className="border-4 border-bg-primary shadow-lg"
                      initialStatus={user.status}
                      showStatus={false}
                    />
                    {uploading && uploadProgress !== undefined && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full z-20">
                        <CircularProgress
                          progress={uploadProgress}
                          size={40}
                          showPercentage={true}
                        />
                      </div>
                    )}
                  </div>

                  {isOwnProfile && (
                    <div className="absolute bottom-1 right-1 z-30">
                      <Dropdown
                        trigger={
                          <Button
                            isLoading={uploading}
                            variant="secondary"
                            className="shadow-md border-2 border-bg-primary rounded-full w-11 h-11 p-0 flex items-center justify-center bg-bg-card hover:bg-bg-hover transition-all duration-base active:scale-95"
                            icon={<Pencil size={18} />}
                          />
                        }
                        align="left"
                      >
                        <DropdownItem
                          icon={<ImageIcon size={16} />}
                          label="Tải ảnh lên"
                          onClick={handleAvatarClick}
                        />
                        {user.avatar?.url && (
                          <DropdownItem
                            icon={<Trash2 size={16} />}
                            label="Xóa ảnh đại diện"
                            variant="danger"
                            onClick={onAvatarDelete || (() => { })}
                          />
                        )}
                      </Dropdown>
                    </div>
                  )}
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
              </div>

              {/* Info */}
              <div className="flex-1 pb-1">
                <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-text-primary">{user.fullName}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 md:mb-2">
                {isOwnProfile ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={onEditClick}
                      icon={<Edit size={18} />}
                      className="flex-1 md:flex-none border-border-medium text-text-primary hover:bg-bg-hover"
                    >
                      Chỉnh sửa
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => navigate('/settings')}
                      icon={<Settings size={18} />}
                      className="md:hidden border-border-medium text-text-primary hover:bg-bg-hover"
                    >
                      Cài đặt
                    </Button>
                  </>
                ) : user.status === 'banned' ? (
                  <div className="flex items-center gap-2">
                    <div className="px-4 py-2 rounded-lg bg-error/10 text-error text-sm font-medium">
                      Tài khoản đã bị khóa
                    </div>
                    <Dropdown
                      trigger={
                        <Button
                          variant="secondary"
                          icon={<MoreHorizontal size={18} />}
                          className="border-border-medium text-text-primary hover:bg-bg-hover"
                        />
                      }
                      align="right"
                    >
                      <DropdownItem
                        icon={<Flag size={16} />}
                        label="Báo cáo"
                        variant="danger"
                        onClick={() => openReportModal(ReportType.USER, user.id, user.id)}
                      />
                    </Dropdown>
                  </div>
                ) : isBlockedByMe ? (
                  <Dropdown
                    trigger={
                      <Button
                        variant="secondary"
                        icon={<MoreHorizontal size={18} />}
                        className="border-border-medium text-text-primary hover:bg-bg-hover"
                      />
                    }
                    align="right"
                  >
                    <DropdownItem
                      icon={<UserCheck size={16} />}
                      label="Bỏ chặn"
                      onClick={onUnblockClick || (() => { })}
                    />
                    <DropdownItem
                      icon={<Flag size={16} />}
                      label="Báo cáo"
                      variant="danger"
                      onClick={() => openReportModal(ReportType.USER, user.id, user.id)}
                    />
                  </Dropdown>
                ) : (
                  <>
                    <Button
                      onClick={onMessageClick}
                      icon={<MessageCircle size={18} />}
                      className="bg-primary hover:bg-primary-hover active:bg-primary-active shadow-md"
                    >
                      Nhắn tin
                    </Button>

                    {friendStatus === FriendStatus.FRIEND ? (
                      <Button
                        variant="secondary"
                        onClick={onFriendClick}
                        icon={<UserCheck size={18} />}
                        className="border-primary/20 bg-primary-light text-primary hover:bg-primary-light/80"
                      >
                        Bạn bè
                      </Button>
                    ) : friendStatus === FriendStatus.PENDING_SENT ? (
                      <Button
                        variant="secondary"
                        onClick={onFriendClick}
                        icon={<UserPlus size={18} />}
                        className="border-border-medium text-text-tertiary bg-bg-secondary cursor-pointer hover:bg-bg-hover"
                      >
                        Đã gửi lời mời
                      </Button>
                    ) : friendStatus === FriendStatus.PENDING_RECEIVED ? (
                      <Button
                        variant="primary"
                        onClick={onFriendClick}
                        icon={<UserPlus size={18} />}
                        className="bg-primary hover:bg-primary-hover active:bg-primary-active shadow-md"
                      >
                        Chấp nhận
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={onFriendClick}
                        icon={<UserPlus size={18} />}
                        className="border-border-medium text-text-primary hover:bg-bg-hover"
                      >
                        Kết bạn
                      </Button>
                    )}

                    <Dropdown
                      trigger={
                        <Button
                          variant="secondary"
                          icon={<MoreHorizontal size={18} />}
                          className="border-border-medium text-text-primary hover:bg-bg-hover"
                        />
                      }
                      align="right"
                    >
                      <DropdownItem
                        icon={<Ban size={16} />}
                        label="Chặn"
                        variant="danger"
                        onClick={onBlockClick || (() => { })}
                      />
                      <DropdownItem
                        icon={<Flag size={16} />}
                        label="Báo cáo"
                        variant="danger"
                        onClick={() => openReportModal(ReportType.USER, user.id, user.id)}
                      />
                    </Dropdown>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Cropper Modal */}
      {cropState && (
        <ImageCropper
          isOpen={cropState.isOpen}
          image={cropState.image}
          aspect={cropState.type === 'avatar' ? 1 : 16 / 9}
          title={cropState.type === 'avatar' ? 'Cắt ảnh đại diện' : 'Cắt ảnh bìa'}
          onCropComplete={handleCropComplete}
          onImageChange={handleImageChange}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
};

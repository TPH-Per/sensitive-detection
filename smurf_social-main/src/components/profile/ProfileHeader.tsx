import React, { useRef, useState } from 'react';
import {
  Users, MessageCircle, UserPlus, UserCheck, Edit,
  Trash2, Pencil, Settings, MoreHorizontal, Flag, Ban, X, Image as ImageIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { User, ReportType, UserStatus, FriendStatus } from '../../../shared/types';
import { UserAvatar, Button, Dropdown, DropdownItem, ImageCropper, LazyImage, CircularProgress } from '../ui';
import { toast } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { getHybridReason } from '../../utils/userUtils';
import { useReportStore } from '../../store/reportStore';
import { BookUser } from 'lucide-react';
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
  uploadingType?: 'avatar' | 'cover' | null;
  uploadProgress?: number;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user, isOwnProfile, friendStatus = FriendStatus.NOT_FRIEND,
  onEditClick, onMessageClick, onFriendClick,
  onAvatarChange, onCoverChange, onAvatarDelete, onCoverDelete,
  onBlockClick, onUnblockClick, isBlockedByMe = false,
  uploadingType, uploadProgress,
}) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore(state => state.user);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { openReportModal } = useReportStore();

  const [cropState, setCropState] = useState<{
    isOpen: boolean; type: 'avatar' | 'cover'; image: string;
  } | null>(null);

  const openFilePicker = (type: 'avatar' | 'cover') => {
    if (!uploadingType) {
      (type === 'avatar' ? avatarInputRef : coverInputRef).current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Chỉ hỗ trợ file ảnh'); e.target.value = ''; return; }
    const validation = validateFileSize(file, type === 'avatar' ? 'AVATAR' : 'COVER');
    if (!validation.isValid) { if (validation.error) toast.error(validation.error); return; }
    const blobUrl = URL.createObjectURL(file);
    setCropState({ isOpen: true, type, image: blobUrl });
    e.target.value = '';
  };

  const handleCropComplete = (croppedFile: File, shouldShare: boolean) => {
    if (cropState?.type === 'avatar') onAvatarChange?.(croppedFile, shouldShare);
    else if (cropState?.type === 'cover') onCoverChange?.(croppedFile, shouldShare);
    if (cropState?.image) URL.revokeObjectURL(cropState.image);
    setCropState(null);
  };

  const handleCropCancel = () => {
    if (cropState?.image) URL.revokeObjectURL(cropState.image);
    setCropState(null);
  };

  const handleImageChange = (file: File) => {
    if (!cropState) return;
    const validation = validateFileSize(file, cropState.type === 'avatar' ? 'AVATAR' : 'COVER');
    if (!validation.isValid) { if (validation.error) toast.error(validation.error); return; }
    if (cropState.image) URL.revokeObjectURL(cropState.image);
    setCropState({ ...cropState, image: URL.createObjectURL(file) });
  };

  return (
    <>
      <div className="max-w-5xl mx-auto">

        {/* ── Cover photo ── */}
        <div className="relative h-[200px] md:h-[320px] w-full md:rounded-b-2xl overflow-hidden shadow-sm">
          {/* Gradient fallback behind image */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-active" />

          <LazyImage
            src={user.cover?.url || '/cover-image.jpg'}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${uploadingType === 'cover' ? 'opacity-50' : 'opacity-100'}`}
            alt="Cover"
          />

          {/* Cover upload progress */}
          {uploadingType === 'cover' && uploadProgress !== undefined && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <CircularProgress progress={uploadProgress} size={56} strokeWidth={4} showPercentage />
            </div>
          )}

          {/* Edit cover button */}
          {isOwnProfile && (
            <div className="absolute bottom-4 right-4" style={{ zIndex: 'var(--z-sticky)' }}>
              <Dropdown
                trigger={
                  <button
                    disabled={!!uploadingType && uploadingType !== 'cover'}
                    className="flex items-center gap-2 px-3 py-2 bg-black/35 hover:bg-black/55 backdrop-blur-md text-white text-sm font-medium rounded-xl border border-white/20 transition-all duration-200 disabled:opacity-50"
                  >
                    <Pencil size={15} />
                    <span className="hidden md:inline">Chỉnh sửa ảnh bìa</span>
                  </button>
                }
                align="right"
              >
                <DropdownItem icon={<ImageIcon size={15} />} label="Tải ảnh lên" onClick={() => openFilePicker('cover')} />
                {user.cover?.url && (
                  <DropdownItem icon={<Trash2 size={15} />} label="Xóa ảnh bìa" variant="danger" onClick={onCoverDelete} />
                )}
              </Dropdown>
            </div>
          )}

          <input ref={coverInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'cover')} className="hidden" />
        </div>

        {/* ── Profile info row ── */}
        <div className="px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center md:items-end text-center md:text-left gap-4 md:gap-6 pb-5 mt-2">

            {/* Avatar */}
            <div className="relative -mt-14 md:-mt-16 mx-auto md:mx-0 flex-shrink-0" style={{ zIndex: 'var(--z-sticky)' }}>
              <div className="p-1 bg-bg-primary rounded-full shadow-md">
                <UserAvatar
                  userId={user.id}
                  src={user.avatar?.url}
                  name={user.fullName}
                  size="2xl"
                  className="border-4 border-bg-primary"
                  initialStatus={user.status}
                  showStatus={false}
                />
                {uploadingType === 'avatar' && uploadProgress !== undefined && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"
                    style={{ zIndex: 'var(--z-overlay)' }}
                  >
                    <CircularProgress progress={uploadProgress} size={40} showPercentage />
                  </div>
                )}
              </div>

              {/* Edit avatar button */}
              {isOwnProfile && (
                <div className="absolute bottom-1 right-1" style={{ zIndex: 'var(--z-dropdown)' }}>
                  <Dropdown
                    trigger={
                      <button
                        disabled={!!uploadingType && uploadingType !== 'avatar'}
                        className="w-9 h-9 flex items-center justify-center bg-bg-primary hover:bg-bg-hover border-2 border-bg-primary rounded-full shadow-md transition-colors duration-200 text-text-secondary hover:text-primary disabled:opacity-50"
                      >
                        <Pencil size={15} />
                      </button>
                    }
                    align="left"
                  >
                    <DropdownItem icon={<ImageIcon size={15} />} label="Tải ảnh lên" onClick={() => openFilePicker('avatar')} />
                    {user.avatar?.url && (
                      <DropdownItem icon={<Trash2 size={15} />} label="Xóa ảnh đại diện" variant="danger" onClick={onAvatarDelete} />
                    )}
                  </Dropdown>
                </div>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'avatar')} className="hidden" />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-2xl md:text-3xl font-bold text-text-primary truncate">
                {user.fullName}
              </h1>
              {!isOwnProfile && friendStatus !== FriendStatus.FRIEND && (
                <div className="flex items-center justify-center md:justify-start gap-1.5 mt-1 text-text-tertiary text-xs md:text-sm font-medium animate-fade-in group">
                  <BookUser size={14} className="text-primary/70 group-hover:text-primary transition-colors" />
                  <span className="truncate">{getHybridReason(currentUser, user)}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-center md:justify-end md:mb-1">
              {isOwnProfile ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={onEditClick}
                    icon={<Edit size={17} />}
                  >
                    Chỉnh sửa
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate('/settings')}
                    icon={<Settings size={17} />}
                    className="md:hidden"
                  >
                    Cài đặt
                  </Button>
                </>
              ) : user.status === UserStatus.BANNED ? (
                <span className="px-3 py-2 rounded-xl bg-error/10 text-error text-sm font-medium border border-error/20">
                  Tài khoản đã bị khóa
                </span>
              ) : isBlockedByMe ? (
                <Dropdown
                  trigger={
                    <Button variant="secondary" icon={<MoreHorizontal size={17} />} />
                  }
                  align="right"
                >
                  <DropdownItem icon={<UserCheck size={15} />} label="Quản lý chặn" onClick={onUnblockClick} />
                  <DropdownItem icon={<Flag size={15} />} label="Báo cáo" variant="danger" onClick={() => openReportModal(ReportType.USER, user.id, user.id)} />
                </Dropdown>
              ) : (
                <>
                  {/* Message */}
                  <Button onClick={onMessageClick} icon={<MessageCircle size={17} />}>
                    Nhắn tin
                  </Button>

                  {/* Friend action */}
                  {friendStatus === FriendStatus.FRIEND ? (
                    <Button
                      variant="secondary"
                      onClick={onFriendClick}
                      icon={<UserCheck size={17} />}
                      className="bg-primary/10 text-primary border-primary/20 hover:bg-error/10 hover:text-error hover:border-error/20"
                    >
                      Bạn bè
                    </Button>
                  ) : friendStatus === FriendStatus.PENDING_SENT ? (
                    <Button
                      variant="secondary"
                      onClick={onFriendClick}
                      icon={<X size={17} />}
                      className="hover:bg-error/10 hover:text-error hover:border-error/20"
                    >
                      Hủy lời mời
                    </Button>
                  ) : friendStatus === FriendStatus.PENDING_RECEIVED ? (
                    <Button onClick={onFriendClick} icon={<UserPlus size={17} />}>
                      Chấp nhận
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={onFriendClick} icon={<UserPlus size={17} />}>
                      Kết bạn
                    </Button>
                  )}

                  {/* More options */}
                  <Dropdown
                    trigger={<Button variant="secondary" icon={<MoreHorizontal size={17} />} />}
                    align="right"
                  >
                    <DropdownItem icon={<Ban size={15} />} label="Chặn" variant="danger" onClick={onBlockClick} />
                    <DropdownItem icon={<Flag size={15} />} label="Báo cáo" variant="danger" onClick={() => openReportModal(ReportType.USER, user.id, user.id)} />
                  </Dropdown>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {cropState && (
        <ImageCropper
          isOpen={cropState.isOpen}
          image={cropState.image}
          aspect={cropState.type === 'avatar' ? 1 : 16 / 9}
          title={cropState.type === 'avatar' ? 'Cắt ảnh đại diện' : 'Cắt ảnh bìa'}
          onCropComplete={handleCropComplete}
          onImageChange={handleImageChange}
          onCancel={handleCropCancel}
          showShareOption
        />
      )}
    </>
  );
};

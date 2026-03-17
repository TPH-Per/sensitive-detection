import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Gender, ReactionType } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { Button, ConfirmDialog, BlockOptionsModal } from '../components/ui';
import { CONFIRM_MESSAGES } from '../constants';
import { PostItem } from '../components/feed';
import { usePostStore } from '../store/postStore';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { EditProfileModal } from '../components/profile/EditProfileModal';
import { PostsTab } from '../components/profile/PostsTab';
import { PhotosTab } from '../components/profile/PhotosTab';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { User as UserIcon, Lock, Cake, MapPin } from 'lucide-react';
import { useProfile, usePostNavigation } from '../hooks';
import { toDate } from '../utils/dateUtils';

type ConfirmType = 'unfriend' | 'deleteAvatar' | 'deleteCover';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const {
    profile,
    latestMedia,
    loading,
    uploading,
    uploadProgress,
    isOwnProfile,
    friendStatus,
    canViewContent,
    activeTab,
    setActiveTab,
    handleMessage,
    handleFriendAction,
    confirmUnfriend,
    handleSaveProfile,
    handleAvatarChange,
    handleCoverChange,
    handleAvatarDelete,
    handleCoverDelete,
    isBlockedByMe,
    isActivityBlockedByPartner,
    currentBlockOptions,
    isBlockModalOpen,
    handleOpenBlockModal,
    handleApplyBlock,
    handleUnblockUser,
    confirmUnblock,
    closeBlockModal,
  } = useProfile();

  const { viewPost } = usePostNavigation();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<ConfirmType | null>(null);

  const onFriendActionClick = async () => {
    const { needConfirm } = await handleFriendAction();
    if (needConfirm) setConfirmType('unfriend');
  };

  const confirmActions: Record<ConfirmType, () => Promise<void>> = {
    unfriend: confirmUnfriend,
    deleteAvatar: handleAvatarDelete,
    deleteCover: handleCoverDelete,
  };

  if (loading || !profile || !currentUser) {
    return <ProfileSkeleton />;
  }

  const isBannedProfile = profile.status === 'banned';

  const confirmConfig: Record<ConfirmType, { title: string; message: string; confirmLabel: string }> = {
    unfriend: {
      title: CONFIRM_MESSAGES.FRIEND.UNFRIEND.TITLE,
      message: CONFIRM_MESSAGES.FRIEND.UNFRIEND.MESSAGE(profile?.fullName || ''),
      confirmLabel: CONFIRM_MESSAGES.FRIEND.UNFRIEND.CONFIRM,
    },
    deleteAvatar: {
      title: CONFIRM_MESSAGES.MEDIA.DELETE_AVATAR.TITLE,
      message: CONFIRM_MESSAGES.MEDIA.DELETE_AVATAR.MESSAGE,
      confirmLabel: CONFIRM_MESSAGES.MEDIA.DELETE_AVATAR.CONFIRM,
    },
    deleteCover: {
      title: CONFIRM_MESSAGES.MEDIA.DELETE_COVER.TITLE,
      message: CONFIRM_MESSAGES.MEDIA.DELETE_COVER.MESSAGE,
      confirmLabel: CONFIRM_MESSAGES.MEDIA.DELETE_COVER.CONFIRM,
    },
  };

  if (isBannedProfile && !isOwnProfile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 md:py-20 text-center bg-bg-secondary h-full flex items-center justify-center">
        <div className="bg-bg-primary rounded-2xl shadow-sm border border-border-light p-10 w-full max-w-lg">
          <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={40} className="text-text-secondary" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-3">Tài khoản này đã bị khóa</h2>
          <p className="text-text-secondary mb-8">
            Người dùng này đã vi phạm quy tắc cộng đồng hoặc không còn tồn tại trên hệ thống.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={() => navigate(-1)} variant="ghost">Quay lại</Button>
            <Button onClick={() => navigate('/')} variant="primary" className="px-8">
              Trang chủ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-bg-secondary">

      <div className="bg-bg-primary shadow-sm mb-4">
        <ProfileHeader
          user={profile}
          isOwnProfile={isOwnProfile}
          friendStatus={friendStatus}
          onEditClick={() => setIsEditModalOpen(true)}
          onMessageClick={handleMessage}
          onFriendClick={onFriendActionClick}
          onAvatarChange={handleAvatarChange}
          onCoverChange={handleCoverChange}
          onAvatarDelete={() => setConfirmType('deleteAvatar')}
          onCoverDelete={() => setConfirmType('deleteCover')}
          onBlockClick={handleOpenBlockModal}
          onUnblockClick={handleUnblockUser}
          isBlockedByMe={isBlockedByMe}
          uploading={uploading}
          uploadProgress={uploadProgress}
        />

        {canViewContent && (
          <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} />
        )}
      </div>

      {canViewContent ? (
        <div className="max-w-5xl mx-auto px-4 pt-2 pb-12">
          {activeTab === 'posts' ? (
            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
              <div className="w-full md:w-[320px] lg:w-[360px] flex-shrink-0 space-y-4">
                <div className="bg-bg-primary rounded-xl shadow-sm border border-border-light p-4">
                  <h3 className="font-bold text-lg mb-4 text-text-primary">Giới thiệu</h3>
                  {profile.bio && (
                    <p className="text-text-primary text-sm mb-4 text-center italic">
                      "{profile.bio}"
                    </p>
                  )}
                  <div className="space-y-3">
                    {profile.dob || profile.gender || profile.location ? (
                      <>
                        {profile.gender && (
                          <div className="flex items-center gap-3 text-text-secondary text-sm">
                            <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg">
                              <UserIcon size={16} />
                            </div>
                            <span>Giới tính <strong className="text-text-primary">{profile.gender === Gender.MALE ? 'Nam' : 'Nữ'}</strong></span>
                          </div>
                        )}
                        {profile.dob && (
                          <div className="flex items-center gap-3 text-text-secondary text-sm">
                            <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg">
                              <Cake size={16} />
                            </div>
                            <span>Sinh ngày <strong className="text-text-primary">{toDate(profile.dob)?.toLocaleDateString('vi-VN')}</strong></span>
                          </div>
                        )}
                        {profile.location && (
                          <div className="flex items-center gap-3 text-text-secondary text-sm">
                            <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg">
                              <MapPin size={16} />
                            </div>
                            <span>Đến từ <strong className="text-text-primary">{profile.location}</strong></span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-text-secondary text-sm text-center py-2">
                        Chưa có thông tin giới thiệu
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-bg-primary rounded-xl shadow-sm border border-border-light p-4 hidden md:block">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg text-text-primary">Ảnh/Video</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('media')}
                      className="text-primary hover:underline font-medium h-auto p-0"
                    >
                      Xem tất cả
                    </Button>
                  </div>
                  {latestMedia.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      {latestMedia.map((url, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-lg overflow-hidden bg-bg-secondary cursor-pointer hover:opacity-90 active:opacity-70 transition-all duration-base"
                          onClick={() => setActiveTab('media')}
                        >
                          {url.includes('.mp4') || url.includes('video') || (url.includes('storage') && url.includes('videos')) ? (
                            <video src={url} className="w-full h-full object-cover" />
                          ) : (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <PostsTab userId={profile.id} currentUser={currentUser} onViewPost={viewPost} />
              </div>
            </div>
          ) : (
            <div>
              {activeTab === 'media' && <PhotosTab userId={profile.id} />}
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-12 md:py-20 text-center">
          <div className="bg-bg-primary rounded-2xl shadow-sm border border-border-light p-10">
            <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock size={40} className="text-text-secondary" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-3">Không thể xem trang này</h2>
            <p className="text-text-secondary mb-8">
              {isBlockedByMe ? 'Bạn đã chặn người dùng này. Bỏ chặn để xem nội dung của họ.' : ''}
              {!isBlockedByMe && isActivityBlockedByPartner ? 'Người dùng này đã giới hạn quyền xem trang cá nhân.' : ''}
              {!isBlockedByMe && !isActivityBlockedByPartner ? 'Bạn không thể xem trang cá nhân này.' : ''}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isBlockedByMe ? (
                <Button onClick={handleUnblockUser} variant="primary" className="px-8">
                  Quản lý chặn
                </Button>
              ) : (
                <Button onClick={() => navigate(-1)} variant="ghost">Quay lại</Button>
              )}
            </div>
          </div>
        </div>
      )}

      <EditProfileModal
        user={profile}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveProfile}
      />

      {confirmType && (
        <ConfirmDialog
          isOpen
          onClose={() => setConfirmType(null)}
          onConfirm={async () => {
            await confirmActions[confirmType]();
            setConfirmType(null);
          }}
          title={confirmConfig[confirmType].title}
          message={confirmConfig[confirmType].message}
          confirmLabel={confirmConfig[confirmType].confirmLabel}
          variant="danger"
        />
      )}

      <BlockOptionsModal
        isOpen={isBlockModalOpen}
        targetName={profile.fullName}
        initialOptions={currentBlockOptions}
        onApply={handleApplyBlock}
        onUnblock={confirmUnblock}
        onClose={closeBlockModal}
      />
    </div>
  );
};

export default ProfilePage;

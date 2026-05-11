import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button, ConfirmDialog, BlockOptionsModal } from '../components/ui';
import { CONFIRM_MESSAGES } from '../constants';
import { PostModal } from '../components/feed';
import { usePostStore, useSharePostStore } from '../store';
import { 
  ProfileHeader, 
  ProfileTabs, 
  EditProfileModal, 
  PostsTab, 
  PhotosTab, 
  ProfileAboutCard, 
  ProfileMediaPreview,
  ProfileSkeleton
} from '../components/profile';
import { Lock } from 'lucide-react';
import { useProfile, usePostNavigation } from '../hooks';
import { UserStatus, ReactionType, Visibility, MediaObject, PostType, PostStatus, Post } from '../../shared/types';

import { db } from '../firebase/config';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { convertDoc } from '../utils/firebaseUtils';

type ConfirmType = 'unfriend' | 'deleteAvatar' | 'deleteCover';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const { reactToPost, updatePost, deletePost, posts } = usePostStore();
  const { viewPost } = usePostNavigation();
  const openSharePost = useSharePostStore(state => state.openSharePost);

  const {
    profile, latestMedia, loading, uploadingType, uploadProgress,
    isOwnProfile, friendStatus, canViewContent, activeTab, setActiveTab,
    handleMessage, handleFriendAction, confirmUnfriend,
    handleSaveProfile, handleAvatarChange, handleCoverChange,
    handleAvatarDelete, handleCoverDelete,
    isBlockedByMe, isBlockedByPartner, currentBlockOptions,
    isBlockModalOpen, handleOpenBlockModal, handleApplyBlock,
    handleUnblockUser, confirmUnblock, closeBlockModal,
  } = useProfile();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<ConfirmType | null>(null);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const handleEditPost = (content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => {
    if (!showEditModal) return;
    updatePost(showEditModal, content, media, visibility, pendingFiles);
  };

  const handleDeletePost = async () => {
    if (!postToDelete || !currentUser) return;
    await deletePost(postToDelete, currentUser.id);
    setPostToDelete(null);
  };

  const handleMediaClick = async (type: PostType) => {
    if (!profile) return;
    try {
      const q = query(
        collection(db, 'posts'),
        where('authorId', '==', profile.id),
        where('type', '==', type),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        viewPost(convertDoc<Post>(snap.docs[0]));
      }
    } catch (error) {
      console.error(`Lỗi lấy bài đăng ${type}`, error);
    }
  };



  const handleOpenShareModal = useCallback((post: Post, authorName: string) => {
    openSharePost(post, authorName);
  }, [openSharePost]);

  const onFriendActionClick = async () => {
    const { needConfirm } = await handleFriendAction();
    if (needConfirm) setConfirmType('unfriend');
  };

  const handlePostReact = useCallback((postId: string, reaction: ReactionType | 'REMOVE') => {
    if (currentUser) reactToPost(postId, currentUser.id, reaction);
  }, [currentUser, reactToPost]);

  const confirmActions: Record<ConfirmType, () => Promise<void>> = {
    unfriend: confirmUnfriend,
    deleteAvatar: handleAvatarDelete,
    deleteCover: handleCoverDelete,
  };

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

  if (loading || !profile || !currentUser) return <ProfileSkeleton />;

  const isBannedProfile = profile.status === UserStatus.BANNED;

  /* ── Banned profile (other user) ── */
  if (isBannedProfile && !isOwnProfile) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-bg-primary rounded-2xl border border-border-light p-10 w-full max-w-md text-center animate-fade-in">
          <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-5 border border-border-light">
            <Lock size={28} className="text-text-tertiary" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Tài khoản này đã bị khóa</h2>
          <p className="text-sm text-text-secondary mb-7 leading-relaxed">
            Người dùng này đã vi phạm quy tắc cộng đồng hoặc không còn tồn tại trên hệ thống.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate(-1)} variant="secondary">Quay lại</Button>
            <Button onClick={() => navigate('/')}>Trang chủ</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      {/* Header card */}
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
          isMessageBlockedByPartner={isBlockedByPartner}
          uploadingType={uploadingType}
          uploadProgress={uploadProgress}
          onAvatarClick={() => handleMediaClick(PostType.AVATAR_UPDATE)}
          onCoverClick={() => handleMediaClick(PostType.COVER_UPDATE)}
        />
        {canViewContent && (
          <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} />
        )}
      </div>

      {canViewContent && (
        <div className="max-w-5xl mx-auto px-4 pt-2 pb-12">
          {activeTab === 'posts' ? (
            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
              {/* ── Left sidebar ── */}
              <div className="w-full md:w-[320px] lg:w-[360px] flex-shrink-0 space-y-4">
                <ProfileAboutCard profile={profile} />
                <ProfileMediaPreview 
                  media={latestMedia} 
                  isBlocked={isBlockedByPartner} 
                  onSeeAll={() => setActiveTab('media')} 
                />
              </div>

              {/* ── Posts column ── */}
              <div className="flex-1 min-w-0">
                <PostsTab
                  userId={profile.id}
                  currentUser={currentUser}
                  onViewPost={viewPost}
                  isFullyBlockedByPartner={isBlockedByPartner}
                  onSharePost={handleOpenShareModal}
                />
              </div>
            </div>
          ) : (
            <div>
              {activeTab === 'media' && (
                <PhotosTab
                  userId={profile.id}
                  isFullyBlockedByPartner={isBlockedByPartner}
                />
              )}
            </div>
          )}
        </div>
      )}

      <EditProfileModal
        user={profile}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveProfile}
      />

      {currentUser && (
        <PostModal
          isOpen={!!showEditModal}
          onClose={() => setShowEditModal(null)}
          currentUser={currentUser}
          initialPost={posts.find(p => p.id === showEditModal) || undefined}
          onSubmit={handleEditPost}
        />
      )}

      <ConfirmDialog
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={handleDeletePost}
        title="Xóa bài viết"
        message="Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa ngay"
        variant="danger"
      />

      {confirmType && (
        <ConfirmDialog
          isOpen
          onClose={() => setConfirmType(null)}
          onConfirm={async () => { await confirmActions[confirmType](); setConfirmType(null); }}
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

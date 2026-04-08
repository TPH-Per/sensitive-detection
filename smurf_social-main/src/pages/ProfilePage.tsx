import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams as useRouterParams } from 'react-router-dom';
import { Gender, UserStatus, MaritalStatus } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { Button, ConfirmDialog, BlockOptionsModal } from '../components/ui';
import { CONFIRM_MESSAGES } from '../constants';
import { PostViewModal, PostModal } from '../components/feed';
import { usePostStore } from '../store';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { EditProfileModal } from '../components/profile/EditProfileModal';
import { PostsTab } from '../components/profile/PostsTab';
import { PhotosTab } from '../components/profile/PhotosTab';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { User as UserIcon, Lock, Cake, MapPin, GraduationCap, Heart, CalendarDays, Sparkles } from 'lucide-react';
import { useProfile, usePostNavigation } from '../hooks';
import { useUserCache } from '../store/userCacheStore';
import { useFriendIds } from '../hooks/utils';
import { toDate } from '../utils/dateUtils';
import { ReactionType, Visibility, MediaObject } from '../../shared/types';
import { postService } from '../services/postService';

type ConfirmType = 'unfriend' | 'deleteAvatar' | 'deleteCover';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const routerParams = useRouterParams<{ '*': string }>();
  const { user: currentUser } = useAuthStore();
  const friendIds = useFriendIds();
  const { fetchPostById, selectedPost, reactToPost, updatePost, deletePost, posts } = usePostStore();
  const { getUser, fetchUser } = useUserCache();
  const { viewPost, closePost } = usePostNavigation();

  const urlPostId = routerParams['*']?.startsWith('post/')
    ? routerParams['*'].replace('post/', '')
    : null;

  const {
    profile, latestMedia, loading, uploadingType, uploadProgress,
    isOwnProfile, friendStatus, canViewContent, activeTab, setActiveTab,
    handleMessage, handleFriendAction, confirmUnfriend,
    handleSaveProfile, handleAvatarChange, handleCoverChange,
    handleAvatarDelete, handleCoverDelete,
    isBlockedByMe, isActivityBlockedByPartner, currentBlockOptions,
    isBlockModalOpen, handleOpenBlockModal, handleApplyBlock,
    handleUnblockUser, confirmUnblock, closeBlockModal,
  } = useProfile();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<ConfirmType | null>(null);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const handleEditPost = async (content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[], onProgress?: (progress: number) => void) => {
    if (!showEditModal) return;
    await updatePost(showEditModal, content, media, visibility, pendingFiles, onProgress);
    setShowEditModal(null);
  };

  const handleDeletePost = async () => {
    if (!postToDelete || !currentUser) return;
    await deletePost(postToDelete, currentUser.id);
    if (selectedPost?.id === postToDelete) {
       closePost();
    }
    setPostToDelete(null);
  };

  const handleUploadImages = async (files: File[], onProgress?: (progress: number) => void) => {
    if (!currentUser) throw new Error('Not authenticated');
    return postService.uploadPostMedia(files, currentUser.id, onProgress);
  };

  useEffect(() => {
    if (!urlPostId || !currentUser) return;
    fetchPostById(urlPostId, currentUser.id, friendIds);
  }, [urlPostId, currentUser?.id, friendIds, fetchPostById]);

  useEffect(() => {
    if (selectedPost?.authorId) fetchUser(selectedPost.authorId);
  }, [selectedPost?.authorId, fetchUser]);

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
      <div className="h-full flex items-center justify-center p-4 bg-bg-secondary">
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
    <div className="h-full w-full overflow-y-auto bg-bg-secondary">
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
          uploadingType={uploadingType}
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
              {/* ── Left sidebar ── */}
              <div className="w-full md:w-[320px] lg:w-[360px] flex-shrink-0 space-y-4">
                {/* About card */}
                <div className="bg-bg-primary rounded-2xl border border-border-light p-4">
                  <h3 className="font-semibold text-base text-text-primary mb-4">Giới thiệu</h3>

                  {profile.bio && (
                    <p className="text-sm text-text-secondary italic text-center mb-4 leading-relaxed">
                      "{profile.bio}"
                    </p>
                  )}

                  {(profile.gender || profile.dob || profile.location || profile.school || profile.maritalStatus || profile.generation || profile.createdAt || (profile.interests && profile.interests.length > 0)) ? (
                    <div className="space-y-3">
                      {profile.gender && (
                        <div className="flex items-center gap-3 text-sm text-text-secondary">
                          <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                            <UserIcon size={15} />
                          </div>
                          <span>
                            Giới tính{' '}
                            <strong className="text-text-primary font-medium">
                              {profile.gender === Gender.MALE ? 'Nam' : 'Nữ'}
                            </strong>
                          </span>
                        </div>
                      )}
                      {profile.dob && (
                        <div className="flex items-center gap-3 text-sm text-text-secondary">
                          <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                            <Cake size={15} />
                          </div>
                          <span>
                            Sinh ngày{' '}
                            <strong className="text-text-primary font-medium">
                              {toDate(profile.dob)?.toLocaleDateString('vi-VN')}
                            </strong>
                          </span>
                        </div>
                      )}
                      {profile.location && (
                        <div className="flex items-center gap-3 text-sm text-text-secondary">
                          <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                            <MapPin size={15} />
                          </div>
                          <span>
                            Đến từ{' '}
                            <strong className="text-text-primary font-medium">
                              {profile.location}
                            </strong>
                          </span>
                        </div>
                      )}
                      {profile.school && (
                        <div className="flex flex-col gap-1 items-start text-sm text-text-secondary">
                          <div className="flex gap-3">
                            <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                              <GraduationCap size={15} />
                            </div>
                            <span className="mt-1">
                              Từng học tại <strong className="text-text-primary font-medium">{profile.school}</strong>
                            </span>
                          </div>
                        </div>
                      )}
                      {profile.maritalStatus && profile.maritalStatus !== MaritalStatus.NONE && (
                        <div className="flex items-center gap-3 text-sm text-text-secondary">
                          <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                            <Heart size={15} />
                          </div>
                          <span>
                            Trạng thái:{' '}
                            <strong className="text-text-primary font-medium">
                              {profile.maritalStatus === MaritalStatus.SINGLE ? 'Độc thân vui vẻ' :
                               profile.maritalStatus === MaritalStatus.MARRIED ? 'Đã kết hôn' :
                               profile.maritalStatus === MaritalStatus.DIVORCED ? 'Đã ly hôn' :
                               profile.maritalStatus === MaritalStatus.WIDOWED ? 'Chăn đơn gối chiếc' :
                               'Mối quan hệ phức tạp'}
                            </strong>
                          </span>
                        </div>
                      )}
                      {profile.generation && (
                        <div className="flex items-center gap-3 text-sm text-text-secondary">
                          <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                            <Sparkles size={15} />
                          </div>
                          <span>
                            Thành viên hệ{' '}
                            <strong className="text-text-primary font-medium">
                              {profile.generation}
                            </strong>
                          </span>
                        </div>
                      )}
                      {profile.createdAt && (
                        <div className="flex items-center gap-3 text-sm text-text-secondary">
                          <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                            <CalendarDays size={15} />
                          </div>
                          <span>
                            Tham gia từ{' '}
                            <strong className="text-text-primary font-medium">
                              Tháng {toDate(profile.createdAt)?.toLocaleDateString('vi-VN', { month: 'numeric', year: 'numeric' })}
                            </strong>
                          </span>
                        </div>
                      )}
                      {profile.interests && profile.interests.length > 0 && (
                        <div className="pt-3 mt-3 border-t border-border-light/60">
                          <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2.5 ml-1">Sở thích</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {profile.interests.map(tag => (
                              <span key={tag} className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-text-tertiary text-center py-2">
                      Chưa có thông tin giới thiệu
                    </p>
                  )}
                </div>

                {/* Media preview card (desktop only) */}
                <div className="bg-bg-primary rounded-2xl border border-border-light p-4 hidden md:block">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-base text-text-primary">Ảnh/Video</h3>
                    <button
                      onClick={() => setActiveTab('media')}
                      className="text-xs text-primary font-semibold hover:underline transition-colors"
                    >
                      Xem tất cả
                    </button>
                  </div>

                  {latestMedia.length > 0 && !isActivityBlockedByPartner ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {latestMedia.map((url, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-xl overflow-hidden bg-bg-secondary cursor-pointer group"
                          onClick={() => setActiveTab('media')}
                        >
                          {url.includes('.mp4') || url.includes('video') ? (
                            <video src={url} className="w-full h-full object-cover" />
                          ) : (
                            <img
                              src={url} alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-tertiary text-center py-2">
                      Chưa có ảnh hoặc video nào
                    </p>
                  )}
                </div>
              </div>

              {/* ── Posts column ── */}
              <div className="flex-1 min-w-0">
                <PostsTab
                  userId={profile.id}
                  currentUser={currentUser}
                  onViewPost={viewPost}
                  isActivityBlockedByPartner={isActivityBlockedByPartner}
                />
              </div>
            </div>
          ) : (
            <div>
              {activeTab === 'media' && (
                <PhotosTab
                  userId={profile.id}
                  isActivityBlockedByPartner={isActivityBlockedByPartner}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Cannot view content ── */
        <div className="flex items-center justify-center p-4 py-16">
          <div className="bg-bg-primary rounded-2xl border border-border-light p-10 w-full max-w-md text-center animate-fade-in">
            <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-5 border border-border-light">
              <Lock size={28} className="text-text-tertiary" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Không thể xem trang này</h2>
            <p className="text-sm text-text-secondary mb-7 leading-relaxed">
              {isBlockedByMe
                ? 'Bạn đã chặn người dùng này. Bỏ chặn để xem nội dung của họ.'
                : !isActivityBlockedByPartner
                  ? 'Bạn không thể xem trang cá nhân này.'
                  : 'Người dùng này đã giới hạn quyền xem trang cá nhân.'}
            </p>
            <div className="flex gap-3 justify-center">
              {isBlockedByMe ? (
                <Button onClick={handleUnblockUser}>Quản lý chặn</Button>
              ) : (
                <Button onClick={() => navigate(-1)} variant="secondary">Quay lại</Button>
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

      <PostViewModal
        isOpen={!!urlPostId}
        onClose={closePost}
        post={selectedPost}
        author={selectedPost ? (getUser(selectedPost.authorId) ?? null) : null}
        currentUser={currentUser}
        onReact={handlePostReact}
        onEdit={(id) => setShowEditModal(id)}
        onDelete={(id) => setPostToDelete(id)}
      />

      {currentUser && (
        <PostModal
          isOpen={!!showEditModal}
          onClose={() => setShowEditModal(null)}
          currentUser={currentUser}
          initialPost={posts.find(p => p.id === showEditModal) || selectedPost || undefined}
          onSubmit={handleEditPost}
          onUploadImages={handleUploadImages}
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

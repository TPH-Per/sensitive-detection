import React, { useState, useCallback } from 'react';
import { StickyNote, Sparkles } from 'lucide-react';
import { PostItem, PostModal, CreatePost, FeedSkeleton, FriendSuggestionsWidget } from '../components/feed';

import { useAuthStore } from '../store/authStore';
import { useSharePostStore } from '../store';
import { useLoadingStore } from '../store/loadingStore';
import { Visibility, MediaObject, Post } from '../../shared/types';
import { useFeed, usePostNavigation } from '../hooks';
import { ConfirmDialog } from '../components/ui';
import { useFriendIds } from '../hooks/utils';

const FeedPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const friendIds = useFriendIds();
  const {
    posts, isLoading, hasMore, usersMap,
    handleReact, handleUpdate, handleDelete, observerRef,
  } = useFeed();
  const isLoadingMore = useLoadingStore(state => state.loadingStates['feed.loadMore']);
  const { viewPost } = usePostNavigation();
  const openSharePost = useSharePostStore(state => state.openSharePost);

  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const handleEditPost = useCallback((
    content: string,
    media: MediaObject[],
    visibility: Visibility,
    pendingFiles?: File[]
  ) => {
    if (!showEditModal) return;
    handleUpdate(showEditModal, content, media, visibility, pendingFiles);
  }, [showEditModal, handleUpdate]);

  const handleDeletePost = useCallback(async () => {
    if (!postToDelete) return;
    const post = posts.find(p => p.id === postToDelete);
    await handleDelete(postToDelete, post?.media);
    setPostToDelete(null);
  }, [postToDelete, posts, handleDelete]);

  const handleOpenShareModal = useCallback((post: Post, authorName: string) => {
    openSharePost(post, authorName);
  }, [openSharePost]);

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-secondary">Vui lòng đăng nhập</p>
      </div>
    );
  }

  if (isLoading && posts.length === 0) return <FeedSkeleton />;

  const editPost = posts.find(p => p.id === showEditModal);

  return (
    <div
      className="flex justify-center h-full w-full overflow-y-auto transition-theme scroll-smooth"
      id="feed-container"
    >
      <div className="w-full max-w-[680px] py-4 md:py-6 px-3 sm:px-4 md:px-0 pb-6 md:pb-10">
        <CreatePost currentUser={currentUser} />
        
        <FriendSuggestionsWidget />

        {posts.length === 0 ? (
          /* ── Empty state ── */
          <div className="bg-bg-primary rounded-2xl p-10 border border-border-light text-center animate-fade-in">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-md" />
              <div className="relative w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center border border-border-light">
                <StickyNote size={26} className="text-text-tertiary" />
              </div>
            </div>
            <p className="text-text-primary text-base font-semibold mb-1.5">Chưa có bài viết nào</p>
            <p className="text-text-secondary text-sm max-w-[260px] mx-auto leading-relaxed">
              Hãy kết nối với bạn bè hoặc chia sẻ khoảnh khắc đầu tiên của bạn!
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:space-y-4">
              {posts.map((post) => {
                const author = usersMap[post.authorId];
                if (!author) return <PostItem.Skeleton key={post.id} />;
                return (
                  <PostItem
                    key={post.id}
                    post={post}
                    author={author}
                    currentUser={currentUser}
                    onReact={handleReact}
                    onEdit={setShowEditModal}
                    onDelete={setPostToDelete}
                    onViewDetail={viewPost}
                    onShare={handleOpenShareModal}
                  />
                );
              })}
            </div>

            <div ref={observerRef} className="h-4 w-full" />

            {isLoadingMore && hasMore && (
              <div className="space-y-4 mt-4">
                {[...Array(2)].map((_, i) => <PostItem.Skeleton key={`more-${i}`} />)}
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <div className="flex items-center justify-center gap-2 py-8">
                <p className="text-text-tertiary text-sm font-medium">Bạn đã xem hết bài viết.</p>
              </div>
            )}
          </>
        )}
      </div>

      <PostModal
        isOpen={!!showEditModal}
        onClose={() => setShowEditModal(null)}
        currentUser={currentUser}
        initialPost={editPost}
        onSubmit={handleEditPost}
      />

      <ConfirmDialog
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={handleDeletePost}
        title="Xóa bài viết"
        message="Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa ngay"
        variant="danger"
      />
    </div>
  );
};

export default FeedPage;

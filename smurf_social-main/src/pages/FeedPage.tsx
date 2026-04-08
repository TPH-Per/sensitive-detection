import React, { useState, useCallback, useEffect } from 'react';
import { StickyNote, Sparkles } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PostItem, PostModal, CreatePost, FeedSkeleton, PostViewModal, FriendSuggestionsWidget } from '../components/feed';
import { postService } from '../services/postService';
import { useAuthStore } from '../store/authStore';
import { usePostStore } from '../store';
import { useLoadingStore } from '../store/loadingStore';
import { Visibility, MediaObject } from '../../shared/types';
import { useFeed, usePostNavigation } from '../hooks';
import { ConfirmDialog } from '../components/ui';
import { useUserCache } from '../store/userCacheStore';
import { useFriendIds } from '../hooks/utils';

const FeedPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const params = useParams<{ '*': string }>();
  const friendIds = useFriendIds();
  const {
    posts, isLoading, hasMore, usersMap,
    handleReact, handleUpdate, handleDelete, observerRef,
  } = useFeed();
  const isLoadingMore = useLoadingStore(state => state.loadingStates['feed.loadMore']);
  const { viewPost, closePost } = usePostNavigation();
  const { fetchPostById, selectedPost } = usePostStore();
  const { getUser, fetchUser } = useUserCache();

  const urlPostId = params['*']?.startsWith('post/') ? params['*'].replace('post/', '') : null;
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!urlPostId || !currentUser) return;
    fetchPostById(urlPostId, currentUser.id, friendIds);
  }, [urlPostId, currentUser?.id, friendIds, fetchPostById]);

  useEffect(() => {
    if (selectedPost?.authorId) fetchUser(selectedPost.authorId);
  }, [selectedPost?.authorId, fetchUser]);

  const handleEditPost = useCallback(async (
    content: string,
    media: MediaObject[],
    visibility: Visibility,
    pendingFiles?: File[],
    onProgress?: (progress: number) => void
  ) => {
    if (!showEditModal) return;
    await handleUpdate(showEditModal, content, media, visibility, pendingFiles, onProgress);
    setShowEditModal(null);
  }, [showEditModal, handleUpdate]);

  const handleDeletePost = useCallback(async () => {
    if (!postToDelete) return;
    const post = posts.find(p => p.id === postToDelete);
    await handleDelete(postToDelete, post?.media);
    setPostToDelete(null);
  }, [postToDelete, posts, handleDelete]);

  const handleUploadImages = useCallback(async (files: File[], onProgress?: (progress: number) => void) => {
    if (!currentUser) throw new Error('Not authenticated');
    return postService.uploadPostMedia(files, currentUser.id, onProgress);
  }, [currentUser]);

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
        onUploadImages={handleUploadImages}
      />

      <PostViewModal
        isOpen={!!urlPostId}
        onClose={closePost}
        post={selectedPost}
        author={selectedPost ? (getUser(selectedPost.authorId) ?? null) : null}
        currentUser={currentUser}
        onReact={handleReact}
        onEdit={(postId) => { closePost(); setShowEditModal(postId); }}
        onDelete={(postId) => { closePost(); setPostToDelete(postId); }}
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

import React, { useState, useCallback } from 'react';
import { StickyNote } from 'lucide-react';
import { PostItem, PostModal, PostViewModal, CreatePost, FeedSkeleton } from '../components/feed';
import { postService } from '../services/postService';
import { useAuthStore } from '../store/authStore';
import { usePostStore } from '../store/postStore';
import { useLoadingStore } from '../store/loadingStore';
import { Visibility } from '../../shared/types';
import { useFeed } from '../hooks';
import { ConfirmDialog } from '../components/ui';

const FeedPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const {
    posts,
    isLoading,
    hasMore,
    usersMap,
    handleReact,
    handleUpdate,
    handleDelete,
    observerRef,
  } = useFeed();
  const isLoadingMore = useLoadingStore(state => state.loadingStates['feed.loadMore']);

  const { selectedPost, setSelectedPost } = usePostStore();

  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const handleEditPost = useCallback(async (
    content: string,
    media: any[],
    visibility: Visibility
  ) => {
    if (!showEditModal) return;
    await handleUpdate(showEditModal, content, media, visibility);
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
    return await postService.uploadPostMedia(files, currentUser.id, (progress) => {
      onProgress?.(progress);
    });
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-secondary">Vui lòng đăng nhập</p>
      </div>
    );
  }

  const editPost = posts.find(p => p.id === showEditModal);

  if (isLoading && posts.length === 0) {
    return <FeedSkeleton />;
  }

  return (
    <div className="flex justify-center h-full w-full overflow-y-auto transition-theme scroll-smooth" id="feed-container">
      <div className="w-full max-w-[680px] py-4 md:py-6 space-y-3 md:space-y-4 px-3 sm:px-4 md:px-0 pb-6 md:pb-8">
        <CreatePost currentUser={currentUser} />



        {posts.length === 0 ? (
          <div className="bg-bg-primary rounded-xl p-6 sm:p-8 md:p-12 shadow-sm border border-border-light text-center transition-theme">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <StickyNote size={28} className="text-text-tertiary opacity-40" />
            </div>
            <p className="text-text-primary text-base sm:text-lg font-semibold">Chưa có bài viết nào</p>
            <p className="text-text-secondary text-sm mt-2 max-w-[260px] mx-auto">
              Hãy kết nối với bạn bè hoặc chia sẻ khoảnh khắc đầu tiên của bạn!
            </p>
          </div>
        ) : (
          <>
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
                  onEdit={(postId) => setShowEditModal(postId)}
                  onDelete={(postId) => setPostToDelete(postId)}
                  onViewDetail={(post) => setSelectedPost(post)}
                />
              );
            })}

            <div ref={observerRef} className="h-4 w-full" />

            {isLoadingMore && hasMore && (
              <div className="space-y-4 mt-4 px-2 md:px-0">
                {[...Array(2)].map((_, i) => (
                  <PostItem.Skeleton key={`more-${i}`} />
                ))}
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <p className="text-center text-text-tertiary text-sm py-8 font-medium">
                Bạn đã xem hết bài viết.
              </p>
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
        isOpen={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        post={selectedPost}
        author={selectedPost ? usersMap[selectedPost.authorId] : null}
        currentUser={currentUser}
        onReact={handleReact}
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

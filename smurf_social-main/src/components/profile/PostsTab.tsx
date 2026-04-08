import React, { useState, useCallback } from 'react';
import { Post, User, Visibility, MediaObject } from '../../../shared/types';
import { PostItem, CreatePost, PostModal } from '../feed';
import { ConfirmDialog } from '../ui';
import { usePostStore } from '../../store';
import { useUserPosts, useIntersectionObserver } from '../../hooks';
import { postService } from '../../services/postService';
import { FileText } from 'lucide-react';

interface PostsTabProps {
  userId: string;
  currentUser: User;
  onViewPost?: (post: Post) => void;
  isActivityBlockedByPartner?: boolean;
}

export const PostsTab: React.FC<PostsTabProps> = ({
  userId, currentUser, onViewPost, isActivityBlockedByPartner = false,
}) => {
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);

  const {
    posts, loading, loadingMore, hasMore, users,
    handleLoadMore, handleReact, handleDelete: performDelete, handleUpdate: performUpdate,
  } = useUserPosts(userId, currentUser);

  const observerRef = useIntersectionObserver(handleLoadMore, {
    enabled: hasMore && !loading && !loadingMore,
  });

  const handleEditPost = useCallback(async (
    content: string,
    media: MediaObject[],
    visibility: Visibility,
    pendingFiles?: File[],
    onProgress?: (progress: number) => void
  ) => {
    if (!showEditModal) return;
    await performUpdate(showEditModal, content, media, visibility, pendingFiles, onProgress);
    setShowEditModal(null);
  }, [showEditModal, performUpdate]);

  const handleDelete = async () => {
    if (!postToDelete) return;
    const post = posts.find(p => p.id === postToDelete);
    await performDelete(postToDelete, post?.media?.map(m => m.url) || []);
    setPostToDelete(null);
  };

  if (loading && !isActivityBlockedByPartner) {
    return (
      <div className="space-y-3 md:space-y-4">
        {[...Array(3)].map((_, i) => <PostItem.Skeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {userId === currentUser.id && <CreatePost currentUser={currentUser} />}

      {isActivityBlockedByPartner || posts.length === 0 ? (
        <div className="bg-bg-primary rounded-2xl border border-border-light p-10 text-center">
          <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-3 border border-border-light">
            <FileText size={22} className="text-text-tertiary" />
          </div>
          <p className="text-sm text-text-secondary font-medium">Chưa có bài viết nào</p>
        </div>
      ) : (
        <>
          {posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              author={users[post.authorId]}
              currentUser={currentUser}
              onReact={handleReact}
              onEdit={setShowEditModal}
              onDelete={setPostToDelete}
              onViewDetail={onViewPost}
            />
          ))}
          <div ref={observerRef} className="h-4 w-full" />
          {loadingMore && (
            <div className="space-y-3 md:space-y-4 mt-2">
              {[...Array(2)].map((_, i) => <PostItem.Skeleton key={`more-${i}`} />)}
            </div>
          )}
        </>
      )}

      <PostModal
        isOpen={!!showEditModal}
        onClose={() => setShowEditModal(null)}
        currentUser={currentUser}
        initialPost={posts.find(p => p.id === showEditModal)}
        onSubmit={handleEditPost}
        onUploadImages={(files, onProgress) =>
          postService.uploadPostMedia(files, currentUser.id, onProgress)
        }
      />

      <ConfirmDialog
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={handleDelete}
        title="Xóa bài viết"
        message="Bạn có chắc chắn muốn xóa bài viết này?"
        confirmLabel="Xóa ngay"
        variant="danger"
      />
    </div>
  );
};

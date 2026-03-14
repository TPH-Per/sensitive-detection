import React, { useState } from 'react';
import { Post, User } from '../../../shared/types';
import { PostItem, CreatePost } from '../feed';
import { ConfirmDialog } from '../ui';
import { toast } from '../../store/toastStore';
import { usePostStore } from '../../store/postStore';
import { useUserPosts, useIntersectionObserver } from '../../hooks';
import { FileText } from 'lucide-react';

interface PostsTabProps {
  userId: string;
  currentUser: User;
}

export const PostsTab: React.FC<PostsTabProps> = ({ userId, currentUser }) => {
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const { setSelectedPost } = usePostStore();

  const {
    posts,
    loading,
    loadingMore,
    hasMore,
    users,
    handleLoadMore,
    handleReact,
    handleDelete: performDelete,
  } = useUserPosts(userId, currentUser);

  const observerRef = useIntersectionObserver(handleLoadMore, {
    enabled: hasMore && !loading && !loadingMore
  });

  const handleDelete = async () => {
    if (!postToDelete) return;

    try {
      const post = posts.find(p => p.id === postToDelete);
      const mediaUrls = post?.media?.map(m => m.url) || [];
      await performDelete(postToDelete, mediaUrls);
      setPostToDelete(null);
    } catch (error) {
      console.error("Lỗi xóa post", error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <PostItem.Skeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {userId === currentUser.id && (
        <CreatePost currentUser={currentUser} />
      )}

      {/* Header with Title */}
      <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-theme">
        <h3 className="font-bold text-lg text-text-primary">Bài viết</h3>
      </div>

      {posts.length === 0 ? (
        <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-8 text-center transition-theme">
          <FileText size={48} className="mx-auto mb-3 text-text-secondary" />
          <p className="text-text-secondary">Chưa có bài viết nào</p>
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
              onEdit={() => { }}
              onDelete={(id) => setPostToDelete(id)}
              onViewDetail={(post) => setSelectedPost(post)}
            />
          ))}

          <div ref={observerRef} className="h-4 w-full" />
          {loadingMore && (
            <div className="space-y-4 mt-4">
              {[...Array(2)].map((_, i) => (
                <PostItem.Skeleton key={`more-${i}`} />
              ))}
            </div>
          )}
        </>
      )}

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

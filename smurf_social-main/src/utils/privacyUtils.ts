import { ReactionType } from '../../shared/types';

/**
 * Kiểm tra quyền xem nội dung dựa trên mô hình Zalo.
 * @param contentAuthorId ID người tạo nội dung (React/Comment)
 * @param postOwnerId ID chủ bài viết
 * @param currentUserId ID người đang xem
 * @param friendIds Danh sách ID bạn bè của người đang xem
 */
export const canViewInteraction = (
  contentAuthorId: string,
  postOwnerId: string,
  currentUserId: string,
  friendIds: string[] = []
): boolean => {
  // Chủ bài viết luôn thấy tất cả
  if (currentUserId === postOwnerId) return true;
  
  // Bản thân người tạo nội dung luôn thấy chính họ
  if (currentUserId === contentAuthorId) return true;
  
  // Người xem là bạn bè của người tạo nội dung
  return friendIds.includes(contentAuthorId);
};

/**
 * Lọc danh sách tương tác (Bình luận/Cảm xúc) theo quyền riêng tư.
 */
export const filterInteractions = <T extends { authorId: string }>(
  items: T[],
  postOwnerId: string,
  currentUserId: string,
  friendIds: string[] = []
): { visibleItems: T[]; hiddenCount: number } => {
  const visibleItems = items.filter(item => 
    canViewInteraction(item.authorId, postOwnerId, currentUserId, friendIds)
  );
  
  return {
    visibleItems,
    hiddenCount: items.length - visibleItems.length
  };
};

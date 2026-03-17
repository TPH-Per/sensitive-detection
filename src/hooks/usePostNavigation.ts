import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useCallback } from 'react';
import { Post } from '../../shared/types';
import { usePostStore } from '../store/postStore';

/**
 * Quản lý điều hướng và trạng thái hiển thị chi tiết bài viết qua URL
 */
export const usePostNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const viewPost = useCallback((post: Post) => {
    const currentPath = location.pathname;
    if (currentPath.includes(`/post/${post.id}`)) return;

    if (currentPath.startsWith('/profile')) {
      const userId = params.userId || 'me';
      navigate(`/profile/${userId}/post/${post.id}`);
    } else {
      navigate(`/feed/post/${post.id}`);
    }
  }, [navigate, location.pathname, params.userId]);

  const closePost = useCallback(() => {
    const currentPath = location.pathname;
    const basePath = currentPath.split('/post/')[0];
    
    if (basePath !== currentPath) {
      navigate(basePath || '/feed');
    }
  }, [navigate, location.pathname]);

  return { viewPost, closePost };
};

import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback } from 'react';
import { Post } from '../../shared/types';

/** Điều hướng và quản lý trạng thái xem chi tiết bài viết */
export const usePostNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const viewPost = useCallback((post: Post) => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('post') === post.id) return;

    searchParams.set('post', post.id);
    navigate(`${location.pathname}?${searchParams.toString()}`);
  }, [navigate, location.pathname, location.search]);

  const closePost = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('post')) {
      searchParams.delete('post');
      const newSearch = searchParams.toString();
      navigate(newSearch ? `${location.pathname}?${newSearch}` : location.pathname);
    }
  }, [navigate, location.pathname, location.search]);

  return { viewPost, closePost };
};

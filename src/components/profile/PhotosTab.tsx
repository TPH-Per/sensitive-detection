import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MessageType } from '../../types';
import { postService } from '../../services/postService';
import { Skeleton, MediaViewer, LazyImage } from '../ui';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFriendIds } from '../../hooks';
import { DocumentSnapshot } from 'firebase/firestore';

const MEDIA_PAGE_SIZE = 15;

interface PhotosTabProps {
  userId: string;
}

type MediaItem = { url: string; type: MessageType.IMAGE | MessageType.VIDEO; thumbnailUrl?: string };

const PhotosTabInner: React.FC<PhotosTabProps> = ({ userId }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const { user: currentUser } = useAuthStore();
  const friendIds = useFriendIds();
  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const observerRef = useRef<HTMLDivElement>(null);

  const extractMedia = useCallback((posts: any[]): MediaItem[] => {
    const items: MediaItem[] = [];
    posts.forEach(post => {
      post.media?.forEach((mediaObj: any) => {
        items.push({
          url: mediaObj.url,
          type: mediaObj.mimeType?.startsWith('video/') ? MessageType.VIDEO : MessageType.IMAGE,
          thumbnailUrl: mediaObj.thumbnailUrl
        });
      });
    });
    return items;
  }, []);


  const loadMedia = useCallback(async (isLoadMore = false) => {
    if (!currentUser) return;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const { posts, lastDoc } = await postService.getUserPosts(
        userId,
        currentUser.id,
        friendIds,
        MEDIA_PAGE_SIZE,
        isLoadMore ? lastDocRef.current ?? undefined : undefined
      );

      lastDocRef.current = lastDoc;
      setHasMore(posts.length === MEDIA_PAGE_SIZE && !!lastDoc);

      const newMedia = extractMedia(posts);
      setMedia(prev => isLoadMore ? [...prev, ...newMedia] : newMedia);
    } catch (error) {
      console.error("Lỗi load media", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId, currentUser, extractMedia]);

  useEffect(() => {
    lastDocRef.current = null;
    setMedia([]);
    setHasMore(true);
    loadMedia(false);
  }, [userId]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore && hasMore) {
          loadMedia(true);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMedia]);

  const mediaViewerItems = useMemo(() =>
    media.map(m => ({
      type: m.type === MessageType.VIDEO ? 'video' as const : 'image' as const,
      url: m.url
    })),
    [media]
  );

  if (loading) return <PhotosTabSkeleton />;

  if (media.length === 0) {
    return (
      <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-4 sm:p-8 text-center transition-theme">
        <ImageIcon size={48} className="mx-auto mb-3 text-text-secondary" />
        <p className="text-text-secondary">Chưa có ảnh hoặc video nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-4 sm:p-6 transition-theme">
        <h3 className="font-bold text-lg mb-4 text-text-primary">
          Ảnh/Video <span className="text-text-secondary font-normal">({media.length}{hasMore ? '+' : ''})</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {media.map((item, index) => (
            <div
              key={`${item.url}-${index}`}
              className="aspect-square bg-secondary rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-all duration-base relative group"
              onClick={() => setSelectedIndex(index)}
            >
              {item.type === 'video' ? (
                <video src={item.url} poster={item.thumbnailUrl} className="w-full h-full object-cover" />
              ) : (
                <LazyImage
                  src={item.url}
                  alt={`Media ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              )}

              {item.type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all duration-base">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-white border-b-[8px] border-b-transparent ml-1" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={observerRef} className="h-4" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}
      </div>

      <MediaViewer
        media={mediaViewerItems}
        initialIndex={selectedIndex}
        isOpen={selectedIndex >= 0}
        onClose={() => setSelectedIndex(-1)}
      />
    </>
  );
};

const PhotosTabSkeleton: React.FC = () => (
  <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-4 sm:p-6 transition-theme">
    <h3 className="font-bold text-lg mb-4 text-text-primary">
      Ảnh/Video <Skeleton width={40} height={20} className="inline-block" />
    </h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {[...Array(10)].map((_, i) => (
        <Skeleton key={i} variant="rect" className="aspect-square rounded-lg" />
      ))}
    </div>
  </div>
);

export const PhotosTab = Object.assign(React.memo(PhotosTabInner), { Skeleton: PhotosTabSkeleton });

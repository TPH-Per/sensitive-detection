import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MessageType, MediaObject } from '../../../shared/types';
import { postService } from '../../services/postService';
import { Skeleton, MediaViewer, LazyImage, SensitiveMediaGuard } from '../ui';
import { Image as ImageIcon, Loader2, Play } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFriendIds } from '../../hooks';
import { DocumentSnapshot } from 'firebase/firestore';

const MEDIA_PAGE_SIZE = 15;

interface PhotosTabProps {
  userId: string;
  isViewActivityBlocked?: boolean;
}

type MediaItem = {
  url: string;
  type: MessageType.IMAGE | MessageType.VIDEO;
  thumbnailUrl?: string;
  isSensitive?: boolean;
};

const PhotosTabInner: React.FC<PhotosTabProps> = ({
  userId, isViewActivityBlocked = false,
}) => {
  const [realtimeMedia, setRealtimeMedia] = useState<MediaItem[]>([]);
  const [historyMedia, setHistoryMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { user: currentUser } = useAuthStore();
  const friendIds = useFriendIds();
  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const observerRef = useRef<HTMLDivElement>(null);

  const extractMedia = useCallback((posts: { media?: MediaObject[] }[]): MediaItem[] =>
    posts.flatMap(post =>
      (post.media || []).map(m => ({
        url: m.url,
        type: m.mimeType?.startsWith('video/') ? MessageType.VIDEO : MessageType.IMAGE,
        thumbnailUrl: m.thumbnailUrl,
        isSensitive: m.isSensitive,
      }))
    ), []);

  const loadMedia = useCallback(async (isLoadMore = false) => {
    if (!currentUser) return;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);
    try {
      const { posts, lastDoc } = await postService.getUserPosts(
        userId, currentUser.id, friendIds, MEDIA_PAGE_SIZE,
        isLoadMore ? lastDocRef.current ?? undefined : undefined
      );
      lastDocRef.current = lastDoc;
      setHasMore(posts.length === MEDIA_PAGE_SIZE && !!lastDoc);
      const newMedia = extractMedia(posts);
      if (isLoadMore) {
        setHistoryMedia(prev => [...prev, ...newMedia]);
      } else {
        setRealtimeMedia(newMedia);
        setHistoryMedia([]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId, currentUser, friendIds, extractMedia]);

  useEffect(() => {
    if (isViewActivityBlocked) {
      setLoading(false); setRealtimeMedia([]); setHistoryMedia([]); setHasMore(false); return;
    }

    lastDocRef.current = null;
    setRealtimeMedia([]);
    setHistoryMedia([]);
    setHasMore(true);

    loadMedia(false);

    const unsubscribe = postService.subscribeToUserPosts(
      userId,
      currentUser?.id || '',
      friendIds,
      (action) => {
        if (action === 'add' || action === 'update' || action === 'remove') {
          postService.getUserPosts(userId, currentUser?.id || '', friendIds, MEDIA_PAGE_SIZE)
            .then(({ posts: latestPosts, lastDoc }) => {
              setRealtimeMedia(extractMedia(latestPosts));
              if (historyMedia.length === 0) {
                lastDocRef.current = lastDoc;
                setHasMore(latestPosts.length === MEDIA_PAGE_SIZE && !!lastDoc);
              }
            });
        }
      },
      MEDIA_PAGE_SIZE
    );

    return () => unsubscribe();
  }, [userId, isViewActivityBlocked, currentUser?.id, friendIds, extractMedia, loadMedia]);

  const media = useMemo(() => {
    const combined = [...realtimeMedia, ...historyMedia];
    const seen = new Set();
    return combined.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [realtimeMedia, historyMedia]);

  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loadingMore) loadMedia(true); },
      { rootMargin: '200px' }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMedia]);

  const mediaViewerItems = useMemo(() =>
    media.map(m => ({
      type: m.type === MessageType.VIDEO ? 'video' as const : 'image' as const,
      url: m.url,
      isSensitive: m.isSensitive,
    })), [media]);

  if (loading && !isViewActivityBlocked) return <PhotosTabSkeleton />;

  if (media.length === 0 || isViewActivityBlocked) {
    return (
      <div className="bg-bg-primary rounded-2xl border border-border-light p-10 text-center">
        <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mx-auto mb-3 border border-border-light">
          <ImageIcon size={22} className="text-text-tertiary" />
        </div>
        <p className="text-sm text-text-secondary font-medium">Chưa có ảnh hoặc video nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-bg-primary rounded-2xl border border-border-light p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base text-text-primary">
            Ảnh/Video
            <span className="text-text-tertiary font-normal ml-1.5 text-sm">
              ({media.length}{hasMore ? '+' : ''})
            </span>
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {media.map((item, index) => (
            <div
              key={`${item.url}-${index}`}
              className="aspect-square bg-bg-secondary rounded-xl overflow-hidden cursor-pointer group relative"
              onClick={() => setSelectedIndex(index)}
            >
              <SensitiveMediaGuard isSensitive={item.isSensitive} size="sm" className="w-full h-full">
                {item.type === MessageType.VIDEO ? (
                  <video
                    src={item.url}
                    poster={item.thumbnailUrl}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <LazyImage
                    src={item.url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    wrapperClassName="w-full h-full"
                  />
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />

                {/* Video play icon */}
                {item.type === MessageType.VIDEO && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:bg-black/60 transition-all duration-200">
                      <Play size={16} className="text-white fill-white ml-0.5" />
                    </div>
                  </div>
                )}
              </SensitiveMediaGuard>
            </div>
          ))}
        </div>

        <div ref={observerRef} className="h-4" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 size={22} className="animate-spin text-primary" />
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
  <div className="bg-bg-primary rounded-2xl border border-border-light p-4 md:p-5">
    <Skeleton width={120} height={20} className="mb-4" />
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {[...Array(10)].map((_, i) => (
        <Skeleton key={i} variant="rect" className="aspect-square rounded-xl" />
      ))}
    </div>
  </div>
);

export const PhotosTab = Object.assign(React.memo(PhotosTabInner), { Skeleton: PhotosTabSkeleton });

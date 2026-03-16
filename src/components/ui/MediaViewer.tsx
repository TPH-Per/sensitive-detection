import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Play, Pause } from 'lucide-react';

interface MediaItem {
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
}

interface MediaViewerProps {
    media: MediaItem[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
    media,
    initialIndex = 0,
    isOpen,
    onClose
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
        }
    }, [isOpen, initialIndex]);

    // Dừng video khi chuyển slide.
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.pause();
            setIsVideoPlaying(false);
        }
    }, [currentIndex]);

    useEffect(() => {
        if (!isOpen && videoRef.current) {
            videoRef.current.pause();
            setIsVideoPlaying(false);
        }
    }, [isOpen]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isOpen) return;

        if (e.key === 'ArrowLeft') {
            setCurrentIndex(prev => (prev > 0 ? prev - 1 : media.length - 1));
        } else if (e.key === 'ArrowRight') {
            setCurrentIndex(prev => (prev < media.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'Escape') {
            onClose();
        } else if (e.key === ' ' && media[currentIndex]?.type === 'video') {
            e.preventDefault();
            toggleVideoPlayback();
        }
    }, [isOpen, media.length, currentIndex, onClose]);

    const toggleVideoPlayback = () => {
        if (videoRef.current) {
            if (isVideoPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsVideoPlaying(!isVideoPlaying);
        }
    };

    useEffect(() => {
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, handleKeyDown]);

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && currentIndex < media.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
        if (isRightSwipe && currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    if (!isOpen) return null;

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex(prev => (prev < media.length - 1 ? prev + 1 : 0));
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : media.length - 1));
    };

    const currentMedia = media[currentIndex];

    return createPortal(
        <div
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/95 backdrop-blur-sm flex flex-col select-none animate-in fade-in duration-200"
            onClick={onClose}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Top bar — close + counter */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 z-[var(--z-dialog)]" onClick={e => e.stopPropagation()}>
                {/* Counter (căn giữa) */}
                <div className="flex-1 flex justify-center">
                    {media.length > 1 && (
                        <span className="text-white/90 font-medium text-base bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                            {currentIndex + 1} / {media.length}
                        </span>
                    )}
                </div>
                {/* Close button — absolute right để không đẩy counter lệch */}
                <button
                    className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full transition-all duration-base backdrop-blur-md border border-white/5"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                >
                    <X size={24} />
                </button>
            </div>

            {/* Media area — chiếm phần còn lại, không tràn lên top bar */}
            <div className="flex-1 min-h-0 relative flex items-center justify-center px-4 pb-4 md:px-20">
                {/* Prev / Next */}
                {media.length > 1 && (
                    <>
                        <button
                            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full backdrop-blur-md border border-white/5 z-[var(--z-dialog)] transition-all duration-base"
                            onClick={handlePrev}
                        >
                            <ChevronLeft size={32} />
                        </button>
                        <button
                            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full backdrop-blur-md border border-white/5 z-[var(--z-dialog)] transition-all duration-base"
                            onClick={handleNext}
                        >
                            <ChevronRight size={32} />
                        </button>
                    </>
                )}

                {/* Video Play/Pause overlay */}
                {currentMedia?.type === 'video' && (
                    <button
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 bg-white/20 hover:bg-white/30 active:bg-white/40 text-white rounded-full backdrop-blur-md border border-white/10 z-[var(--z-dialog)] transition-all duration-base"
                        onClick={(e) => { e.stopPropagation(); toggleVideoPlayback(); }}
                    >
                        {isVideoPlaying ? <Pause size={32} /> : <Play size={32} />}
                    </button>
                )}

                {currentMedia?.type === 'video' ? (
                    <video
                        ref={videoRef}
                        src={currentMedia.url}
                        poster={currentMedia.thumbnail}
                        className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-200 shadow-2xl rounded-sm"
                        onClick={(e) => e.stopPropagation()}
                        controls
                        playsInline
                        onPlay={() => setIsVideoPlaying(true)}
                        onPause={() => setIsVideoPlaying(false)}
                    />
                ) : (
                    <img
                        src={currentMedia?.url}
                        className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-200 shadow-2xl rounded-sm"
                        onClick={(e) => e.stopPropagation()}
                        alt={`View ${currentIndex + 1}`}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Play, Pause } from 'lucide-react';
import { useScrollLock } from '../../hooks/utils/useScrollLock';
import { SensitiveMediaGuard } from './SensitiveMediaGuard';

interface MediaItem {
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
    isSensitive?: boolean;
}

interface MediaViewerProps {
    media: MediaItem[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
    media, initialIndex = 0, isOpen, onClose,
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useScrollLock(isOpen);

    useEffect(() => {
        if (isOpen) setCurrentIndex(initialIndex);
    }, [isOpen, initialIndex]);

    useEffect(() => {
        videoRef.current?.pause();
        setIsVideoPlaying(false);
    }, [currentIndex, isOpen]);

    const goNext = useCallback(() => setCurrentIndex(p => (p < media.length - 1 ? p + 1 : 0)), [media.length]);
    const goPrev = useCallback(() => setCurrentIndex(p => (p > 0 ? p - 1 : media.length - 1)), [media.length]);

    const toggleVideo = useCallback(() => {
        if (!videoRef.current) return;
        if (isVideoPlaying) { videoRef.current.pause(); } else { videoRef.current.play(); }
        setIsVideoPlaying(p => !p);
    }, [isVideoPlaying]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isOpen) return;
        if (e.key === 'ArrowLeft') goPrev();
        else if (e.key === 'ArrowRight') goNext();
        else if (e.key === 'Escape') onClose();
        else if (e.key === ' ' && media[currentIndex]?.type === 'video') { e.preventDefault(); toggleVideo(); }
    }, [isOpen, goPrev, goNext, onClose, currentIndex, media, toggleVideo]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const dist = touchStart - touchEnd;
        if (dist > 50) goNext();
        else if (dist < -50) goPrev();
    };

    if (!isOpen) return null;

    const current = media[currentIndex];

    return createPortal(
        <div
            className="fixed inset-0 bg-black/95 backdrop-blur-sm flex flex-col select-none animate-fade-in"
            style={{ zIndex: 'var(--z-dialog)' }}
            onClick={onClose}
            onTouchStart={(e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
            onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={onTouchEnd}
        >
            {/* Header */}
            <div
                className="relative flex-shrink-0 flex items-center justify-between px-4 py-3 min-h-[64px] bg-gradient-to-b from-black/60 to-transparent"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-12 hidden md:block" />
                <div className="flex-1 flex justify-center items-center">
                    {media.length > 1 && (
                        <span className="text-white/85 font-medium text-sm bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-sm">
                            {currentIndex + 1} / {media.length}
                        </span>
                    )}
                </div>
                <button
                    className="p-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-full transition-colors duration-200 backdrop-blur-md border border-white/10 shadow-lg"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    aria-label="Đóng"
                >
                    <X size={22} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 relative flex items-center justify-center px-4 pb-4 md:px-20">
                {media.length > 1 && (
                    <>
                        <button
                            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white rounded-full backdrop-blur-md border border-white/10 transition-all duration-200 active:scale-95"
                            onClick={(e) => { e.stopPropagation(); goPrev(); }}
                        >
                            <ChevronLeft size={28} />
                        </button>
                        <button
                            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white rounded-full backdrop-blur-md border border-white/10 transition-all duration-200 active:scale-95"
                            onClick={(e) => { e.stopPropagation(); goNext(); }}
                        >
                            <ChevronRight size={28} />
                        </button>
                    </>
                )}

                {current?.type === 'video' && (
                    <button
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md border border-white/10 transition-all duration-200 active:scale-95"
                        style={{ zIndex: 10 }}
                        onClick={(e) => { e.stopPropagation(); toggleVideo(); }}
                    >
                        {isVideoPlaying ? <Pause size={28} /> : <Play size={28} />}
                    </button>
                )}

                {current?.type === 'video' ? (
                    <SensitiveMediaGuard isSensitive={current.isSensitive} className="w-full h-full min-h-0 min-w-0">
                        <div className="w-full h-full flex items-center justify-center">
                            <video
                                ref={videoRef}
                                src={current.url}
                                poster={current.thumbnail}
                                className="max-w-full max-h-full object-contain shadow-xl rounded-sm"
                                onClick={(e) => e.stopPropagation()}
                                controls playsInline
                                onPlay={() => setIsVideoPlaying(true)}
                                onPause={() => setIsVideoPlaying(false)}
                            />
                        </div>
                    </SensitiveMediaGuard>
                ) : (
                    <SensitiveMediaGuard isSensitive={current?.isSensitive} className="w-full h-full min-h-0 min-w-0">
                        <div className="w-full h-full flex items-center justify-center">
                            <img
                                src={current?.url}
                                alt={`Ảnh ${currentIndex + 1}`}
                                className="max-w-full max-h-full object-contain shadow-xl rounded-sm"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </SensitiveMediaGuard>
                )}
            </div>
        </div>,
        document.body
    );
};

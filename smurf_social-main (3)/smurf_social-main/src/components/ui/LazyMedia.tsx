import React, { useState, useRef, useEffect } from 'react';

const DEFAULT_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdG09IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNGNEY1RjciLz48cmVjdCB4PSIxNTAiIHk9IjEwMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHJ4PSIxMiIgZmlsbD0iI0QxRDVREIi8+PGNpcmNsZSBjeD0iMTgwIiBjeT0iMTMwIiByPSIxMiIgZmlsbD0iI0Y0RjVGNyIvPjxwYXRoIGQ9Ik0xNTAgMTYwTDE4MCAxMzBMMjEwIDE2MEwyMzAgMTQwTDI1MCAxNjBWMTkwSDE1MFYxNjBaIiBmaWxsPSIjRjRGNUY3Ii8+PC9zdmc+';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
  fallback?: string;
  className?: string;
  wrapperClassName?: string;
  onLoad?: (e?: any) => void;
}

/**
 * Hiển thị ảnh với cơ chế Lazy load và hiệu ứng Fade-in
 */
export const LazyImage: React.FC<LazyImageProps> = ({ 
  src, alt, className = '', wrapperClassName = '', fallback = DEFAULT_PLACEHOLDER, 
  onLoad: externalOnLoad, ...props 
}) => {
  const isBlob = src.startsWith('blob:');
  const [isInView, setIsInView] = useState(isBlob);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isBlob) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [src, isBlob]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${wrapperClassName}`}>
      {!isLoaded && (
        <div className={`w-full h-full bg-bg-secondary animate-pulse ${className}`} />
      )}
      
      {isInView && (
        <img
          src={error ? fallback : src}
          alt={alt}
          onLoad={() => {
            setIsLoaded(true);
            externalOnLoad?.();
          }}
          onError={() => {
            setError(true);
            setIsLoaded(true);
            externalOnLoad?.();
          }}
          className={`relative z-10 w-full h-full object-cover transition-opacity duration-500 ease-out ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className}`}
          loading={isBlob ? 'eager' : 'lazy'}
          {...props}
        />
      )}
    </div>
  );
};

interface LazyVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  thumbnail?: string;
  className?: string;
  wrapperClassName?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  onLoad?: (e?: any) => void;
}

/**
 * Hiển thị video với cơ chế Lazy load và hỗ trợ thumbnail
 */
export const LazyVideo: React.FC<LazyVideoProps> = ({
  src, thumbnail, className = '', wrapperClassName = '', 
  autoPlay, muted, loop, controls, onLoad: externalOnLoad, ...props
}) => {
  const isBlob = src.startsWith('blob:');
  const [isInView, setIsInView] = useState(isBlob);
  const [showVideo, setShowVideo] = useState(isBlob);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isBlob) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsInView(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [src, isBlob]);

  if (!isInView) {
    return (
      <div ref={containerRef} className={`relative ${wrapperClassName}`}>
        <div className={`w-full h-full bg-bg-secondary animate-pulse ${className}`} style={{ aspectRatio: '16/9' }} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${wrapperClassName}`}>
      {!showVideo && thumbnail ? (
        <div className="relative cursor-pointer group w-full" onClick={() => setShowVideo(true)}>
          <img src={thumbnail} alt="Video thumbnail" className={`w-full object-cover ${className}`} />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-all duration-200">
            <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-text-primary ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <video
          src={src} poster={thumbnail}
          className={`w-full h-full object-cover ${className}`}
          controls={controls ?? !autoPlay} 
          preload={isBlob ? 'auto' : 'none'} 
          playsInline autoPlay={autoPlay} muted={muted} loop={loop}
          onLoadedData={externalOnLoad}
          {...props}
        />
      )}
    </div>
  );
};

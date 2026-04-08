import React, { useState, useRef, useEffect } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
  fallback?: string;
  className?: string;
  wrapperClassName?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src, alt, placeholder, fallback = '/placeholder-image.png',
  className = '', wrapperClassName = '', ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [error, setError] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsInView(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden ${wrapperClassName}`}>
      {!isLoaded && !placeholder && (
        <div className="absolute inset-0 bg-bg-secondary animate-pulse" />
      )}
      {!isLoaded && placeholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-70 transition-opacity duration-300 ${className}`}
        />
      )}
      {isInView && (
        <img
          src={error ? fallback : src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          onError={() => { setError(true); setIsLoaded(true); }}
          className={`relative z-10 w-full h-full object-cover transition-opacity duration-500 ease-out ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className}`}
          loading="lazy"
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
}

export const LazyVideo: React.FC<LazyVideoProps> = ({
  src, thumbnail, className = '', wrapperClassName = '', ...props
}) => {
  const [isInView, setIsInView] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsInView(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
          controls preload="none" playsInline
          {...props}
        />
      )}
    </div>
  );
};

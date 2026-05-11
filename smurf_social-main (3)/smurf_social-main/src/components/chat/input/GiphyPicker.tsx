import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, TrendingUp } from 'lucide-react';
import { IconButton } from '../../ui';

interface GiphyPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

interface GiphyImage {
  id: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    fixed_height_still: {
      url: string;
    };
  };
  title: string;
}

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

/** Bộ chọn ảnh GIF từ Giphy */
export const GiphyPicker: React.FC<GiphyPickerProps> = ({ onSelect, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const fetchGifs = useCallback(async (query = '') => {
    if (!GIPHY_API_KEY) {
      setError('Thiếu Giphy API Key trong cấu hình.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const endpoint = query ? 'search' : 'trending';
    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      limit: '20',
      rating: 'pg',
      ...(query && { q: query }),
    });

    try {
      const response = await fetch(`${GIPHY_BASE_URL}/${endpoint}?${params}`);
      const result = await response.json();
      
      if (response.ok) {
        setGifs(result.data);
      } else {
        setError(result.meta?.msg || 'Không thể tải GIF.');
      }
    } catch (err) {
      setError('Lỗi kết nối đến Giphy.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGifs();
  }, [fetchGifs]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchGifs(query);
    }, 500);
  };

  return (
    <div className="flex flex-col w-full max-w-sm bg-bg-primary border border-border-light rounded-xl shadow-xl overflow-hidden animate-fade-in" style={{ height: '400px' }}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border-light bg-bg-secondary/30">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Tìm kiếm GIF trên Giphy..."
            className="w-full pl-9 pr-4 py-2 bg-bg-primary border border-border-light rounded-full text-sm focus:outline-none focus:border-primary/50 transition-colors"
            autoFocus
          />
        </div>
        <IconButton
          icon={<X size={18} />}
          onClick={onClose}
          size="sm"
          variant="ghost"
          className="text-text-tertiary hover:text-text-primary"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {isLoading && gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-tertiary">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-sm font-medium">Đang tải GIF...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-error p-4 text-center">
            <span className="text-sm font-medium">{error}</span>
            <button
              onClick={() => fetchGifs(searchQuery)}
              className="text-xs text-primary hover:underline font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-tertiary">
            <Search size={40} strokeWidth={1.5} className="opacity-20" />
            <span className="text-sm">Không tìm thấy GIF nào</span>
          </div>
        ) : (
          <div>
            {!searchQuery && (
              <div className="flex items-center gap-1.5 mb-3 text-xs font-bold text-text-tertiary uppercase tracking-wider">
                <TrendingUp size={14} className="text-primary" />
                <span>Xu hướng</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gif.images.fixed_height.url)}
                  className="relative group aspect-square bg-bg-tertiary rounded-lg overflow-hidden transition-all duration-200 active:scale-95"
                >
                  <img
                    src={gif.images.fixed_height.url}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/o group-hover:bg-black/10 transition-colors" />
                </button>
              ))}
            </div>
            {isLoading && (
              <div className="flex justify-center p-4">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Attribution */}
      <div className="px-3 py-2 border-t border-border-light bg-bg-secondary/20 flex items-center justify-between">
        <img
          src="https://giphy.com/static/img/powered_by_giphy_light.png"
          alt="Powered by GIPHY"
          className="h-4 object-contain brightness-90 dark:invert"
        />
        <span className="text-[10px] text-text-tertiary">v1.0</span>
      </div>
    </div>
  );
};

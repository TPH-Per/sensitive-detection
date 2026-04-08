import React, { useRef, useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useContacts } from '../../hooks';
import { SuggestionItem } from '../contacts';
import { Button } from '../ui';

export const FriendSuggestionsWidget: React.FC = () => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { filteredSuggestions, isSuggestionsLoading, handleAddFriend, handleDismissSuggestion } = useContacts();
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [filteredSuggestions, isSuggestionsLoading]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const gap = 12;
    const scrollAmount = scrollRef.current.clientWidth + gap; 
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Hiển thị toàn bộ gợi ý (Backend trả về tối đa 20)
  const displaySuggestions = filteredSuggestions;

  if (!isSuggestionsLoading && displaySuggestions.length === 0) {
    return null;
  }

  return (
    <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden mb-4 animate-fade-in shadow-sm group/widget relative">
      <div className="px-4 py-3 flex items-center justify-between bg-bg-secondary/30">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-text-primary">Gợi ý kết bạn</h2>
        </div>
        {!isSuggestionsLoading && filteredSuggestions.length > 5 && (
          <button
            onClick={() => navigate('/contacts')}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            Xem tất cả
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      <div className="relative px-4">
        {!isSuggestionsLoading && displaySuggestions.length > 0 && (
          <>
            {showLeftArrow && (
              <button
                onClick={() => scroll('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-bg-primary/95 backdrop-blur-md border border-border-light text-text-secondary shadow-lg opacity-0 group-hover/widget:opacity-100 transition-all duration-300 hover:bg-primary hover:text-white scale-90 hover:scale-100"
                aria-label="Cuộn trái"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {showRightArrow && (
              <button
                onClick={() => scroll('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-bg-primary/95 backdrop-blur-md border border-border-light text-text-secondary shadow-lg opacity-0 group-hover/widget:opacity-100 transition-all duration-300 hover:bg-primary hover:text-white scale-90 hover:scale-100"
                aria-label="Cuộn phải"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </>
        )}

        <div 
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-hide pb-4 pt-1 gap-3 scroll-smooth"
        >
          {isSuggestionsLoading ? (
            [...Array(4)].map((_, i) => <SuggestionItem.Skeleton variant="card" key={i} className="w-[calc((100%-12px)/2)] min-w-[calc((100%-12px)/2)] sm:w-[calc((100%-24px)/3)] sm:min-w-[calc((100%-24px)/3)] md:w-[calc((100%-36px)/4)] md:min-w-[calc((100%-36px)/4)]" />)
          ) : (
            displaySuggestions.map(user => (
              <SuggestionItem
                variant="card"
                key={user.id}
                user={user}
                onAddFriend={handleAddFriend}
                onDismiss={handleDismissSuggestion}
                className="w-[calc((100%-12px)/2)] min-w-[calc((100%-12px)/2)] sm:w-[calc((100%-24px)/3)] sm:min-w-[calc((100%-24px)/3)] md:w-[calc((100%-36px)/4)] md:min-w-[calc((100%-36px)/4)]"
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

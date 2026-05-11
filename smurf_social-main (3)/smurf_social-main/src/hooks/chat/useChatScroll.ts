import { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { RtdbMessage } from '../../../shared/types';

interface UseChatScrollProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
  conversationId: string;
  currentUserId: string;
  isLoading: boolean;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
}

export const useChatScroll = ({
  messages,
  conversationId,
  currentUserId,
  isLoading,
  hasMoreMessages,
  isLoadingMore,
  onLoadMore
}: UseChatScrollProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMessagesLength = useRef(messages.length);
  const prevLastMessageId = useRef<string | null>(messages.length > 0 ? messages[messages.length - 1].id : null);
  const scrollHeightBeforeLoad = useRef(0);
  const loadMoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);

/** Tự động cuộn xuống tin nhắn mới nhất */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'instant') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
      setShouldAutoScroll(true);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !container.firstElementChild) return;

    const content = container.firstElementChild;
    const resizeObserver = new ResizeObserver(() => {
      if (shouldAutoScroll) {
        scrollToBottom('instant');
      }
    });

    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [shouldAutoScroll, scrollToBottom]);

  useLayoutEffect(() => {
    if (messages.length > 0 && !isLoading) {
      scrollToBottom('instant');
      setUnreadCount(0);
    }
  }, [conversationId, isLoading, messages.length > 0, scrollToBottom]);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      const lastMsg = messages[messages.length - 1];
      const isNewMessage = prevLastMessageId.current !== lastMsg.id;
      const isMyMessage = lastMsg.data.senderId === currentUserId;

      if (isNewMessage) {
        if (isMyMessage || shouldAutoScroll) {
          scrollToBottom('smooth');
        } else {
          setUnreadCount(prev => prev + 1);
        }
      } else if (messagesContainerRef.current) {

        const currentScrollHeight = messagesContainerRef.current.scrollHeight;
        messagesContainerRef.current.scrollTop = currentScrollHeight - scrollHeightBeforeLoad.current;
      }
    }
    
    prevMessagesLength.current = messages.length;
    prevLastMessageId.current = messages.length > 0 ? messages[messages.length - 1].id : null;
  }, [messages, shouldAutoScroll, scrollToBottom, currentUserId]);

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isAtBottom);
    
    if (isAtBottom) {
      setUnreadCount(0);
    }

    if (scrollTop < 100 && hasMoreMessages && !isLoadingMore && onLoadMore) {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }

      loadMoreTimeoutRef.current = setTimeout(() => {
        scrollHeightBeforeLoad.current = scrollHeight - scrollTop;
        onLoadMore();
      }, 150);
    }
  }, [hasMoreMessages, isLoadingMore, onLoadMore]);

  useEffect(() => {
    return () => {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }
    };
  }, []);

  return {
    messagesEndRef,
    messagesContainerRef,
    handleScroll,
    scrollToBottom,
    shouldAutoScroll,
    unreadCount
  };
};




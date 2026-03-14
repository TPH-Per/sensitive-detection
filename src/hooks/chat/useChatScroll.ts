import { useRef, useEffect, useState, useCallback } from 'react';
import { RtdbMessage } from '../../../shared/types';

interface UseChatScrollProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
  conversationId: string;
  isLoading: boolean;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
}

export const useChatScroll = ({
  messages,
  conversationId,
  isLoading,
  hasMoreMessages,
  isLoadingMore,
  onLoadMore
}: UseChatScrollProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessagesLength = useRef(messages.length);
  const scrollHeightBeforeLoad = useRef(0);
  const loadMoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cuộn xuống cuối khi mới vào hoặc đổi hội thoại
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        setShouldAutoScroll(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [conversationId, isLoading, messages.length === 0]);

  // Cuộn xuống cuối khi có tin nhắn mới (nếu đang ở gần cuối)
  useEffect(() => {
    if (messages.length > 0 && prevMessagesLength.current > 0) {
      if (messages.length > prevMessagesLength.current) {
        const lastMsg = messages[messages.length - 1];
        const prevLastMsg = messages[prevMessagesLength.current - 1];
        const isNewMessage = !prevLastMsg || lastMsg.data.createdAt > prevLastMsg.data.createdAt;

        if (isNewMessage && shouldAutoScroll) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else if (!isNewMessage && messagesContainerRef.current) {
          const currentScrollHeight = messagesContainerRef.current.scrollHeight;
          messagesContainerRef.current.scrollTop = currentScrollHeight - scrollHeightBeforeLoad.current;
        }
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, shouldAutoScroll]);

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isAtBottom);

    if (scrollTop < 50 && hasMoreMessages && !isLoadingMore && onLoadMore) {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }

      loadMoreTimeoutRef.current = setTimeout(() => {
        scrollHeightBeforeLoad.current = scrollHeight;
        onLoadMore();
      }, 150);
    }
  }, [hasMoreMessages, isLoadingMore, onLoadMore]);

  // Cleanup timeout on unmount
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
    handleScroll
  };
};

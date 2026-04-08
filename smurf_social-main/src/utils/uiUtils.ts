import { RefObject } from 'react';
import { ReactionType } from '../../shared/types';

// Cuộn đến tin nhắn và hiệu ứng highlight
export const scrollToMessage = (messageId: string) => {
  const element = document.getElementById(`msg-${messageId}`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('animate-highlight');
    
    // Xóa class highlight sau khi hiệu ứng kết thúc
    setTimeout(() => {
      element.classList.remove('animate-highlight');
    }, 2000);
  }
};

export const getLastName = (fullName?: string) =>
  fullName?.trim().split(' ').pop() || '';

export const insertTextAtCursor = (
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  currentText: string,
  text: string,
  onUpdate: (newText: string) => void
) => {
  const start = ref.current?.selectionStart || 0;
  const end = ref.current?.selectionEnd || 0;
  const newText = currentText.substring(0, start) + text + currentText.substring(end);
  onUpdate(newText);
  setTimeout(() => {
    const newPos = start + text.length;
    ref.current?.focus();
    ref.current?.setSelectionRange(newPos, newPos);
  }, 0);
};

export const getReactionColorClass = (type: ReactionType | string | null) => {
  if (!type) return 'text-text-tertiary';
  const rt = type.toLowerCase();
  switch (rt) {
    case 'like':
      return '!text-primary hover:!text-primary-hover';
    case 'love':
    case 'angry':
      return '!text-error hover:!text-error/90';
    case 'haha':
    case 'wow':
    case 'sad':
      return '!text-warning hover:!text-warning/90';
    default:
      return '!text-primary hover:!text-primary-hover';
  }
};

export const getReactionBgClass = (type: ReactionType | string | null) => {
  if (!type) return '';
  const rt = type.toLowerCase();
  switch (rt) {
    case 'like':
      return '!bg-primary/5';
    case 'love':
    case 'angry':
      return '!bg-error/5';
    case 'haha':
    case 'wow':
    case 'sad':
      return '!bg-warning/10';
    default:
      return '!bg-primary/5';
  }
};

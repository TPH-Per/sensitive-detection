import React, { useState, useCallback } from 'react';
import { User } from '../../../shared/types';

interface UseMentionsProps {
  inputText: string;
  setInputText: (text: string) => void;
  participants: User[];
  currentUserId: string;
  isGroup: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export const useMentions = ({
  inputText,
  setInputText,
  participants,
  currentUserId,
  isGroup,
  inputRef
}: UseMentionsProps) => {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);

  const filteredParticipants = participants
    .filter(p => p.id !== currentUserId)
    .filter(p => p.fullName.toLowerCase().includes(mentionQuery.toLowerCase()));

  const handleInputChange = useCallback((text: string, selectionStart: number) => {
    if (!isGroup) return;

    const textBeforeCursor = text.slice(0, selectionStart);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const query = textBeforeCursor.slice(lastAtPos + 1);
      if (!query.includes('\n')) {
        setMentionStartPos(lastAtPos);
        setMentionQuery(query);
        setShowMentions(true);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentions(false);
  }, [isGroup]);

  const handleSelectMention = useCallback((user: User) => {
    if (mentionStartPos === -1) return;

    const before = inputText.slice(0, mentionStartPos);
    const afterCursor = inputRef.current?.selectionStart || mentionStartPos + 1;
    const after = inputText.slice(afterCursor);

    const mentionText = `@[${user.id}:${user.fullName}] `;
    const newText = before + mentionText + after;

    setInputText(newText);
    setShowMentions(false);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        const newPos = before.length + mentionText.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  }, [inputText, mentionStartPos, setInputText, inputRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions || filteredParticipants.length === 0) return false;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(prev => (prev > 0 ? prev - 1 : filteredParticipants.length - 1));
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(prev => (prev < filteredParticipants.length - 1 ? prev + 1 : 0));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSelectMention(filteredParticipants[mentionIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowMentions(false);
      return true;
    }
    return false;
  }, [showMentions, filteredParticipants, mentionIndex, handleSelectMention]);

  return {
    showMentions,
    setShowMentions,
    mentionQuery,
    mentionIndex,
    setMentionIndex,
    filteredParticipants,
    handleInputChange,
    handleSelectMention,
    handleKeyDown
  };
};

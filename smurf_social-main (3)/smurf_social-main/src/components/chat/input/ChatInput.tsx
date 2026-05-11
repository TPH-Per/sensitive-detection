import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, X, Edit2, Reply, Ban } from 'lucide-react';
import { EmojiPicker, Button, IconButton, TextArea } from '../../ui';
import { MentionList } from './MentionList';
import { FilePreview, FilePreviewItem } from './FilePreview';
import { RecordingUI } from './RecordingUI';
import { ActionsMenu } from './ActionsMenu';
import { useAudioRecorder } from '../../../hooks/chat/useAudioRecorder';
import { useMentions } from '../../../hooks/chat/useMentions';
import { useLinkPreview } from '../../../hooks/useLinkPreview';
import { toast } from '../../../store/toastStore';
import { TOAST_MESSAGES, FILE_LIMITS, TIME_LIMITS, VALIDATION } from '../../../constants';
import { insertTextAtCursor, validateFile } from '../../../utils';
import { useRtdbChatStore } from '../../../store';
import { RtdbMessage, User, MessageType } from '../../../../shared/types';
import { LinkPreviewCard } from '../../shared/LinkPreviewCard';
import { getMessageDisplayContent } from '../../../utils/chatUtils';
import { GiphyPicker } from './GiphyPicker';
interface ChatInputProps {
  onSendText: (text: string, mentions?: string[], replyToId?: string) => void;
  onSendImages: (files: File[], options?: { content?: string; mentions?: string[]; replyToId?: string }) => Promise<void>;
  onSendFile: (file: File, replyToId?: string) => void;
  onSendVideo?: (file: File, replyToId?: string) => void;
  onSendVoice?: (file: File, replyToId?: string, duration?: number) => void;
  onSendGif?: (url: string, replyToId?: string) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
  blockedMessage?: string;
  replyingTo?: { id: string; data: RtdbMessage };
  editingMessage: { id: string; data: RtdbMessage } | null;
  onCancelAction: () => void;
  onEditMessage?: (text: string) => Promise<void>;
  currentUserId: string;
  usersMap: Record<string, User>;
  participants?: User[];
  isGroup?: boolean;
  isDisbanded?: boolean;
  onDeleteConversation?: () => void;
  onManageBlock?: () => void;
  isBlockedByMe?: boolean;
  conversationId?: string;
  isLoadingSettings?: boolean;
}

/** Component nhập tin nhắn chat */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText, onSendImages, onSendFile, onSendVideo, onSendVoice, onSendGif,
  onTyping, disabled = false, blockedMessage,
  replyingTo, editingMessage, onCancelAction, onEditMessage,
  currentUserId, usersMap, participants = [],
  isGroup = false, isDisbanded = false,
  onDeleteConversation, onManageBlock, isBlockedByMe = false,
  conversationId, isLoadingSettings = false,
}) => {
  const { saveDraft, clearDraft, draftMessages } = useRtdbChatStore();
  const [inputText, setInputText] = useState(() =>
    conversationId ? (draftMessages[conversationId] ?? '') : ''
  );
  const [activeMentions, setActiveMentions] = useState<{ id: string; name: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FilePreviewItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>(undefined);
  const isCurrentlyTypingRef = useRef(false);

  const { isRecording, recordingDuration, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder({
      onRecordingComplete: (blob, duration) => {
        const audioFile = new File([blob], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioFile);
        setSelectedFiles(prev => {
          prev.forEach(f => { if (f.type === 'voice' && f.preview) URL.revokeObjectURL(f.preview); });
          return [
            ...prev.filter(f => f.type !== 'voice'),
            { id: `voice-${Date.now()}`, file: audioFile, preview: url, type: 'voice', duration },
          ];
        });
      },
      onError: (err) => toast.error(err.message),
    });

  const {
    showMentions, setShowMentions, mentionIndex, filteredParticipants,
    handleInputChange: handleMentionInputChange,
    handleSelectMention: handleSelectMentionInternal,
    handleKeyDown: handleMentionKeyDown,
  } = useMentions({ inputText, setInputText, participants, currentUserId, isGroup, inputRef });

  /* Link Preview */
  const linkPreview = useLinkPreview(editingMessage ? '' : inputText);

  const onSelectMention = useCallback((user: User) => {
    const userSelected = handleSelectMentionInternal(user);
    if (userSelected) {
      setActiveMentions(prev =>
        prev.find(m => m.id === userSelected.id)
          ? prev
          : [...prev, { id: userSelected.id, name: userSelected.fullName }]
      );
    }
  }, [handleSelectMentionInternal]);

  useEffect(() => {
    if (!isSending && !disabled) inputRef.current?.focus();
  }, [isSending, disabled]);

  useEffect(() => {
    if (editingMessage) {
      setInputText(editingMessage.data.content);
    } else {
      setInputText(conversationId ? (useRtdbChatStore.getState().draftMessages[conversationId] ?? '') : '');
    }
  }, [editingMessage, conversationId]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
      selectedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    };
  }, []);

  const detectedActiveMentions = useMemo(() => {
    if (!inputText) return [];
    const mentionRegex = /@([^\n\u200B]+)\u200B/g;
    const namesInText: string[] = [];
    let match;
    while ((match = mentionRegex.exec(inputText)) !== null) namesInText.push(match[1]);
    return activeMentions.filter(m => namesInText.includes(m.name));
  }, [inputText, activeMentions]);

  useEffect(() => {
    if (JSON.stringify(detectedActiveMentions) !== JSON.stringify(activeMentions)) {
      setActiveMentions(detectedActiveMentions);
    }
  }, [detectedActiveMentions]);

  const renderMentionOverlay = useCallback((value: string) => (
    <>
      {value.split(/(@[^\n\u200B]+\u200B)/g).map((part, i) => {
        if (part.startsWith('@') && part.endsWith('\u200B')) {
          return (
            <span
              key={i}
              className="text-primary bg-primary/10 rounded font-medium border-b border-primary/30"
            >
              {part.slice(0, -1)}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {value.endsWith('\n') && <br />}
    </>
  ), []);

  const draftTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let text = e.target.value;
    if (text.length > VALIDATION.MESSAGE_MAX_LENGTH) {
      text = text.slice(0, VALIDATION.MESSAGE_MAX_LENGTH);
    }
    setInputText(text);

    if (conversationId && !editingMessage) {
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
      draftTimeoutRef.current = setTimeout(() => saveDraft(conversationId, text), 500);
    }

    if (!isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = true;
      onTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isCurrentlyTypingRef.current = false;
      onTyping(false);
    }, TIME_LIMITS.TYPING_TIMEOUT);

    handleMentionInputChange(text, e.target.selectionStart);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (selectedFiles.length + files.length > FILE_LIMITS.CHAT_MAX_FILES) {
      toast.error(TOAST_MESSAGES.CHAT.FILE_LIMIT(FILE_LIMITS.CHAT_MAX_FILES));
      return;
    }

    const newFiles: FilePreviewItem[] = [];
    files.forEach(file => {
      let fileType: 'image' | 'video' | 'file' = 'file';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';

      const limitType = fileType === 'image' ? 'IMAGE' : fileType === 'video' ? 'VIDEO' : 'FILE';
      const validation = validateFile(file, limitType);
      if (!validation.isValid) { if (validation.error) toast.error(validation.error); return; }

      const preview = (fileType === 'image' || fileType === 'video')
        ? URL.createObjectURL(file)
        : undefined;
      newFiles.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file, preview, type: fileType,
      });
    });

    setSelectedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const clearAllFiles = () => {
    selectedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setSelectedFiles([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || isSending || (!inputText.trim() && selectedFiles.length === 0)) return;

    setIsSending(true);
    onTyping(false);

    try {
      const imageFiles = selectedFiles.filter(f => f.type === 'image');
      const videoFiles = selectedFiles.filter(f => f.type === 'video');
      const otherFiles = selectedFiles.filter(f => f.type !== 'image' && f.type !== 'video');

      const canCombineText = imageFiles.length === 1 && videoFiles.length === 0 && otherFiles.length === 0 && inputText.trim();
      let textSentWithImages = false;

      if (imageFiles.length > 0) {
        let combinedContent = '';
        let combinedMentions: string[] = [];

        if (canCombineText) {
          const tempMentions = [...activeMentions];
          combinedContent = inputText.trim().replace(/@([^\n\u200B]+)\u200B/g, (match, fullName) => {
            const idx = tempMentions.findIndex(m => m.name === fullName);
            if (idx !== -1) {
              const mention = tempMentions[idx];
              combinedMentions.push(mention.id);
              tempMentions.splice(idx, 1);
              return `@[${mention.id}:${mention.name}]`;
            }
            return match;
          });
          combinedMentions = [...new Set(combinedMentions)];
          textSentWithImages = true;
        }

        onSendImages(imageFiles.map(f => f.file), {
          replyToId: replyingTo?.id,
          content: textSentWithImages ? combinedContent : undefined,
          mentions: textSentWithImages ? (combinedMentions.length > 0 ? combinedMentions : undefined) : undefined
        }).catch(() => {
          toast.error(TOAST_MESSAGES.CHAT.SEND_FAILED);
        });
      }

      for (const video of videoFiles) {
        try { onSendVideo?.(video.file, replyingTo?.id); } catch {
          toast.error(TOAST_MESSAGES.CHAT.SEND_FAILED);
        }
      }

      for (const item of otherFiles) {
        if (item.type === 'voice') {
          try { onSendVoice?.(item.file, replyingTo?.id, item.duration); } catch {
            toast.error(TOAST_MESSAGES.CHAT.SEND_FAILED);
          }
        } else {
          onSendFile(item.file, replyingTo?.id);
        }
      }

      if (inputText.trim() && !textSentWithImages) {
        if (editingMessage) {
          if (inputText.trim() !== editingMessage.data.content) {
            await onEditMessage?.(inputText.trim());
          }
        } else {
          let finalContent = inputText.trim();
          const mentions: string[] = [];
          const tempMentions = [...activeMentions];

          finalContent = finalContent.replace(/@([^\n\u200B]+)\u200B/g, (match, fullName) => {
            const idx = tempMentions.findIndex(m => m.name === fullName);
            if (idx !== -1) {
              const mention = tempMentions[idx];
              mentions.push(mention.id);
              tempMentions.splice(idx, 1);
              return `@[${mention.id}:${mention.name}]`;
            }
            return match;
          });

          await onSendText(
            finalContent,
            mentions.length > 0 ? [...new Set(mentions)] : undefined,
            replyingTo?.id
          );
        }
      }

      if (inputText.trim()) {
        setInputText('');
        setActiveMentions([]);
        if (conversationId) {
          if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
          clearDraft(conversationId);
        }
      }

      clearAllFiles();
      onCancelAction();
    } catch {
      toast.error(TOAST_MESSAGES.CHAT.SEND_FAILED);
    } finally {
      setIsSending(false);
      isCurrentlyTypingRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(e)) return;

    if (e.key === 'Backspace') {
      const cursor = e.currentTarget.selectionStart;
      const text = e.currentTarget.value;
      const mentionMatch = text.slice(0, cursor).match(/@([^\n\u200B]+)\u200B ?$/);
      if (mentionMatch) {
        e.preventDefault();
        const deleteLength = mentionMatch[0].length;
        const name = mentionMatch[1];
        const newText = text.substring(0, cursor - deleteLength) + text.substring(cursor);
        setInputText(newText);
        setActiveMentions(prev =>
          prev.filter(m => m.name !== name || newText.includes(`@${m.name}\u200B`))
        );
        setTimeout(() => {
          if (inputRef.current) {
            const newPos = cursor - deleteLength;
            inputRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const handlePlayVoice = (url: string, index: number) => {
    if (playingPreview === index) {
      audioRef.current?.pause();
      setPlayingPreview(null);
    } else {
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.onended = () => setPlayingPreview(null);
      audio.play().catch(() => toast.error(TOAST_MESSAGES.CHAT.AUDIO_PLAY_FAILED));
      audioRef.current = audio;
      setPlayingPreview(index);
    }
  };

  const canSend = (inputText.trim() || selectedFiles.length > 0) && !blockedMessage;

  if (isLoadingSettings) {
    return (
      <div className="flex-shrink-0 border-t border-border-light bg-bg-primary pb-safe h-[60px] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  /* Blocked Or Disbanded State */
  if (blockedMessage || isDisbanded) {
    return (
      <div
        className="flex-shrink-0 border-t border-border-light bg-bg-primary pb-safe"
        style={{ zIndex: 'var(--z-sticky)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
              <Ban size={15} className="text-error" />
            </div>
            <span className="text-sm text-text-secondary font-medium truncate">
              {isDisbanded ? 'Nhóm này đã giải tán.' : blockedMessage}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isDisbanded && onDeleteConversation && (
              <Button onClick={onDeleteConversation} variant="danger" size="sm">
                Xóa hội thoại
              </Button>
            )}
            {!isDisbanded && onManageBlock && isBlockedByMe && (
              <Button onClick={onManageBlock} size="sm">
                Quản lý chặn
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 border-t border-border-light bg-bg-primary transition-theme pb-safe relative"
      style={{ zIndex: 'var(--z-sticky)' }}
    >
      {/* Giphy Picker Popover */}
      {showGiphy && (
        <div className="absolute bottom-full left-0 mb-2 ml-3 z-[var(--z-popover)]">
          <div className="fixed inset-0" onClick={() => setShowGiphy(false)} />
          <div className="relative">
            <GiphyPicker
              onSelect={(url) => {
                onSendGif?.(url, replyingTo?.id);
                setShowGiphy(false);
                onCancelAction();
              }}
              onClose={() => setShowGiphy(false)}
            />
          </div>
        </div>
      )}

      {/* File Previews */}
      <FilePreview
        files={selectedFiles}
        onRemove={removeFile}
        onPlayVoice={handlePlayVoice}
        playingIndex={playingPreview}
        isSending={isSending}
      />

      {/* Link Preview */}
      {!editingMessage && linkPreview.url && !linkPreview.isDismissed && (
        <div className="px-3 pt-2">
          <LinkPreviewCard
            url={linkPreview.url}
            previewData={linkPreview.isLoading ? undefined : linkPreview.previewData}
            onDismiss={linkPreview.dismiss}
            compact
          />
        </div>
      )}

      {/* Reply Or Edit Banner */}
      {(replyingTo || editingMessage) && (
        <div className="px-4 py-2 border-b border-border-light bg-bg-secondary/80 backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0 border-l-4 border-primary pl-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {editingMessage
                ? <Edit2 size={14} className="text-primary" />
                : <Reply size={14} className="text-primary" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-primary leading-none mb-1">
                {editingMessage
                  ? 'Đang chỉnh sửa tin nhắn'
                  : replyingTo?.data.senderId === currentUserId
                    ? 'Trả lời chính bạn'
                    : `Trả lời ${usersMap[replyingTo?.data.senderId || '']?.fullName || ''}`
                }
              </p>
              <p className="text-[11px] text-text-secondary truncate opacity-80 italic">
                {editingMessage
                  ? editingMessage.data.content
                  : getMessageDisplayContent(replyingTo!.data)
                }
              </p>
            </div>
          </div>
          <IconButton
            onClick={onCancelAction}
            icon={<X size={14} />}
            size="sm"
            variant="ghost"
            className="flex-shrink-0 hover:bg-black/5 dark:hover:bg-white/5"
          />
        </div>
      )}

      {/* Input Row */}
      <form onSubmit={handleSubmit} className="relative flex items-end gap-2 px-3 py-2.5">
        {/* Mention Dropdown */}
        {showMentions && filteredParticipants.length > 0 && (
          <MentionList
            users={filteredParticipants}
            selectedIndex={mentionIndex}
            onSelect={onSelectMention}
          />
        )}

        <ActionsMenu
          isOpen={showActions}
          onToggle={() => setShowActions(!showActions)}
          onAction={(type) => {
            setShowActions(false);
            if (type === 'media') fileInputRef.current?.click();
            else if (type === 'voice') startRecording();
            else if (type === 'gif') setShowGiphy(true);
          }}
          disabled={disabled || isSending || isRecording}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {isRecording ? (
          <RecordingUI
            duration={recordingDuration}
            onCancel={cancelRecording}
            onStop={stopRecording}
          />
        ) : (
          <TextArea
            ref={inputRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tin nhắn..."
            disabled={disabled || isSending}
            autoResize
            maxHeight={120}
            containerClassName="flex-1"
            className="rounded-xl bg-bg-secondary border-border-light"
            renderOverlay={renderMentionOverlay}
            rightElement={
              <div className="flex items-center">
                {inputText.length >= VALIDATION.MESSAGE_MAX_LENGTH * 0.8 && (
                  <span className={`text-[9px] font-bold mr-1 px-1 rounded ${
                    inputText.length >= VALIDATION.MESSAGE_MAX_LENGTH ? 'text-error bg-error/10' : 'text-text-tertiary'
                  }`}>
                    {inputText.length}/{VALIDATION.MESSAGE_MAX_LENGTH}
                  </span>
                )}
                <EmojiPicker
                  onEmojiSelect={(emoji) =>
                    insertTextAtCursor(inputRef, inputText, emoji, setInputText)
                  }
                  disabled={disabled || isSending}
                  buttonClassName="p-1.5 text-text-tertiary hover:text-primary transition-colors"
                />
              </div>
            }
          />
        )}

        {/* Send Button */}
        <button
          type="submit"
          disabled={disabled || !!blockedMessage || (!inputText.trim() && selectedFiles.length === 0) || isSending}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
            transition-colors duration-200 active:brightness-95
            ${canSend
              ? 'btn-gradient text-white shadow-accent hover:brightness-110'
              : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed'
            }
          `}
        >
          {isSending
            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <Send size={16} className={canSend ? 'fill-current' : ''} />
          }
        </button>
      </form>
    </div>
  );
};

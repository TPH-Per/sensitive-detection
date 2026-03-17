import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, X, Edit2, Reply, Pause, Play, Ban } from 'lucide-react';
import { EmojiPicker, Button, IconButton, TextArea } from '../../ui';
import { MentionList } from './MentionList';
import { FilePreview, FilePreviewItem } from './FilePreview';
import { RecordingUI } from './RecordingUI';
import { ActionsMenu } from './ActionsMenu';
import { useAudioRecorder } from '../../../hooks/chat/useAudioRecorder';
import { useMentions } from '../../../hooks/chat/useMentions';
import { toast } from '../../../store/toastStore';
import { TOAST_MESSAGES, FILE_LIMITS, TIME_LIMITS } from '../../../constants';
import { insertTextAtCursor, validateFileSize } from '../../../utils';
import { RtdbMessage, User } from '../../../../shared/types';

interface ChatInputProps {
  onSendText: (text: string, mentions?: string[], replyToId?: string) => void;
  onSendImages: (files: File[], replyToId?: string) => Promise<void>;
  onSendFile: (file: File, replyToId?: string) => void;
  onSendVideo?: (file: File, replyToId?: string) => void;
  onSendVoice?: (file: File, replyToId?: string) => void;
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
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onSendImages,
  onSendFile,
  onSendVideo,
  onSendVoice,
  onTyping,
  disabled = false,
  blockedMessage,
  replyingTo,
  editingMessage,
  onCancelAction,
  onEditMessage,
  currentUserId,
  usersMap,
  participants = [],
  isGroup = false,
  isDisbanded = false,
  onDeleteConversation,
  onManageBlock
}) => {
  const [inputText, setInputText] = useState('');
  const [activeMentions, setActiveMentions] = useState<{ id: string; name: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FilePreviewItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>(undefined);
  const isCurrentlyTypingRef = useRef(false);

  const {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  } = useAudioRecorder({
    onRecordingComplete: (blob, duration) => {
      const audioFile = new File([blob], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
      const url = URL.createObjectURL(audioFile);
      setSelectedFiles(prev => {
        // Remove existing voice previews to avoid memory leaks
        prev.forEach(f => {
          if (f.type === 'voice' && f.preview) URL.revokeObjectURL(f.preview);
        });
        const filtered = prev.filter(f => f.type !== 'voice');
        return [...filtered, { file: audioFile, preview: url, type: 'voice' }];
      });
    },
    onError: (err) => toast.error(err.message)
  });

  const {
    showMentions,
    setShowMentions,
    mentionIndex,
    filteredParticipants,
    handleInputChange: handleMentionInputChange,
    handleSelectMention: handleSelectMentionInternal,
    handleKeyDown: handleMentionKeyDown
  } = useMentions({
    inputText,
    setInputText,
    participants,
    currentUserId,
    isGroup,
    inputRef
  });

  const onSelectMention = useCallback((user: User) => {
      const userSelected = handleSelectMentionInternal(user);
      
      if (userSelected) {
        setActiveMentions(prev => {
          if (prev.find(m => m.id === userSelected.id)) return prev;
          return [...prev, { id: userSelected.id, name: userSelected.fullName }];
        });
      }
    }, [handleSelectMentionInternal]);

  useEffect(() => {
    if (!isSending && !disabled) {
      inputRef.current?.focus();
    }
    if (editingMessage) {
      setInputText(editingMessage.data.content);
    }
  }, [editingMessage, isSending, disabled]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      selectedFiles.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, [selectedFiles]);

  const detectedActiveMentions = useMemo(() => {
    if (!inputText) return [];
    
    const mentionRegex = /@([^\n\u200B]+)\u200B/g;
    const namesInText: string[] = [];
    let match;
    while ((match = mentionRegex.exec(inputText)) !== null) {
      namesInText.push(match[1]);
    }
    
    return activeMentions.filter(m => namesInText.includes(m.name));
  }, [inputText, activeMentions]);

  useEffect(() => {
    if (JSON.stringify(detectedActiveMentions) !== JSON.stringify(activeMentions)) {
      setActiveMentions(detectedActiveMentions);
    }
  }, [detectedActiveMentions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);

    // Chỉ gọi onTyping(true) một lần khi bắt đầu gõ
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

    const newFiles: { file: File; preview?: string; type: 'image' | 'video' | 'file' | 'voice' }[] = [];
    files.forEach(file => {
      let fileType: 'image' | 'video' | 'file' = 'file';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';

      const limitType = fileType === 'image' ? 'IMAGE' : fileType === 'video' ? 'VIDEO' : 'FILE';
      const validation = validateFileSize(file, limitType);
      if (!validation.isValid) {
        if (validation.error) toast.error(validation.error);
        return;
      }

      const preview = (fileType === 'image' || fileType === 'video') ? URL.createObjectURL(file) : undefined;
      newFiles.push({ file, preview, type: fileType });
    });

    setSelectedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const removed = newFiles.splice(index, 1)[0];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return newFiles;
    });
  };

  const clearAllFiles = () => {
    selectedFiles.forEach(f => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setSelectedFiles([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || isSending || (!inputText.trim() && selectedFiles.length === 0)) return;

    setIsSending(true);
    onTyping(false);

    try {
      const flushImageBatch = async (batch: File[]) => {
        if (batch.length === 0) return;
        await onSendImages(batch, replyingTo?.id);
      };

      let imageBatch: File[] = [];
      for (const item of selectedFiles) {
        if (item.type === 'image') {
          imageBatch.push(item.file);
          continue;
        }

        await flushImageBatch(imageBatch);
        imageBatch = [];

        if (item.type === 'video') await onSendVideo?.(item.file, replyingTo?.id);
        else if (item.type === 'voice') await onSendVoice?.(item.file, replyingTo?.id);
        else await onSendFile(item.file, replyingTo?.id);
      }

      await flushImageBatch(imageBatch);
      clearAllFiles();

      if (inputText.trim()) {
        if (editingMessage) {
          await onEditMessage?.(inputText.trim());
        } else {
          let finalContent = inputText.trim();
          const mentions: string[] = [];

          const tempActiveMentions = [...activeMentions];
          
          finalContent = finalContent.replace(/@([^\n\u200B]+)\u200B/g, (match, fullName) => {
            const index = tempActiveMentions.findIndex(m => m.name === fullName);
            if (index !== -1) {
              const mention = tempActiveMentions[index];
              mentions.push(mention.id);
              tempActiveMentions.splice(index, 1);
              return `@[${mention.id}:${mention.name}]`;
            }
            return match;
          });

          await onSendText(finalContent, mentions.length > 0 ? [...new Set(mentions)] : undefined, replyingTo?.id);
        }
        setInputText('');
        setActiveMentions([]);
      }
      onCancelAction();
    } catch (error) {
      console.error("Lỗi gửi tin nhắn", error);
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
      const beforeCursor = text.slice(0, cursor);
      
      const mentionMatch = beforeCursor.match(/@([^\n\u200B]+)\u200B ?$/);

      if (mentionMatch) {
        e.preventDefault();
        const deleteLength = mentionMatch[0].length;
        const name = mentionMatch[1];
        const newText = text.substring(0, cursor - deleteLength) + text.substring(cursor);
        setInputText(newText);
        
        setActiveMentions(prev => prev.filter(m => m.name !== name || newText.includes(`@${m.name}\u200B`)));
        
        setTimeout(() => {
          if (inputRef.current) {
            const newPos = cursor - deleteLength;
            inputRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
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

  if (blockedMessage || isDisbanded) {
    return (
      <div className="flex-shrink-0 border-t border-border-light bg-bg-primary pb-safe z-30">
        <div className="flex flex-row items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-error-light flex items-center justify-center flex-shrink-0">
              <Ban size={16} className="text-error" />
            </div>
            <span className="text-text-secondary text-sm font-medium truncate">
              {isDisbanded ? 'Nhóm này đã giải tán.' : blockedMessage}
            </span>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {isDisbanded && onDeleteConversation && (
              <Button
                onClick={onDeleteConversation}
                variant="danger"
                size="sm"
                className="rounded-xl px-4"
              >
                Xóa hội thoại
              </Button>
            )}
            {!isDisbanded && onManageBlock && (
              <Button
                onClick={onManageBlock}
                variant="primary"
                size="sm"
                className="rounded-xl px-4"
              >
                Quản lý chặn
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 border-t border-border-light bg-bg-primary transition-theme pb-safe z-30 relative">
      <FilePreview
        files={selectedFiles}
        onRemove={removeFile}
        onPlayVoice={handlePlayVoice}
        playingIndex={playingPreview}
        isSending={isSending}
      />

      {(replyingTo || editingMessage) && (
        <div className="px-4 py-2 border-b border-border-light bg-bg-secondary flex items-center justify-between animate-in slide-in-from-bottom-1 duration-200">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="text-primary flex-shrink-0 bg-primary/10 p-2 rounded-lg">
              {editingMessage ? <Edit2 size={16} /> : <Reply size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-primary mb-0.5">
                {editingMessage ? 'Đang chỉnh sửa' : (replyingTo?.data.senderId === currentUserId ? 'Trả lời chính bạn' : `Trả lời ${usersMap[replyingTo?.data.senderId || '']?.fullName || ''}`)}
              </div>
              <div className="text-[13px] text-text-secondary truncate">
                {editingMessage ? editingMessage.data.content : (replyingTo?.data.type === 'text' ? replyingTo.data.content : `[${replyingTo?.data.type}]`)}
              </div>
            </div>
          </div>
          <IconButton onClick={onCancelAction} icon={<X size={14} />} size="sm" variant="secondary" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative flex items-center gap-2 px-4 py-3 bg-bg-primary">
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
          }}
          disabled={disabled || isSending || isRecording}
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

        {isRecording ? (
          <RecordingUI duration={recordingDuration} onCancel={cancelRecording} onStop={stopRecording} />
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
            className="rounded-2xl"
            renderOverlay={useCallback((value: string) => (
              <>
                {value.split(/(@[^\n\u200B]+\u200B)/g).map((part, i) => {
                  if (part.startsWith('@') && part.endsWith('\u200B')) {
                    return (
                      <span key={i} className="text-primary bg-primary/10 rounded box-decoration-clone font-medium border-b-2 border-primary/20">
                        {part.slice(0, -1)}
                      </span>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
                {value.endsWith('\n') && <br />}
              </>
            ), [])}
            rightElement={
              <EmojiPicker
                onEmojiSelect={(emoji) => {
                  insertTextAtCursor(inputRef, inputText, emoji, setInputText);
                }}
                disabled={disabled || isSending}
                buttonClassName="p-1.5 text-text-secondary hover:text-primary"
              />
            }
          />
        )}

        <Button
          type="submit"
          disabled={disabled || !!blockedMessage || (!inputText.trim() && selectedFiles.length === 0)}
          isLoading={isSending}
          variant={(inputText.trim() || selectedFiles.length > 0) && !blockedMessage ? 'primary' : 'secondary'}
          className={`w-11 h-11 shadow-md rounded-full flex-shrink-0 ${((inputText.trim() || selectedFiles.length > 0) && !blockedMessage) ? '' : 'opacity-40'}`}
          icon={<Send size={20} className={(inputText.trim() || selectedFiles.length > 0) && !blockedMessage ? 'fill-current' : ''} />}
        />
      </form>
    </div>
  );
};



import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, Edit2, Reply, Pause, Play } from 'lucide-react';
import { EmojiPicker, Button, IconButton, TextArea } from '../../ui';
import { MentionList } from './MentionList';
import { FilePreview } from './FilePreview';
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
  onDeleteConversation
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; preview?: string; type: 'image' | 'video' | 'file' | 'voice' }[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>(undefined);

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
    handleSelectMention,
    handleKeyDown: handleMentionKeyDown
  } = useMentions({
    inputText,
    setInputText,
    participants,
    currentUserId,
    isGroup,
    inputRef
  });

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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);

    // Typing indicator
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), TIME_LIMITS.TYPING_TIMEOUT);

    handleMentionInputChange(text, e.target.selectionStart);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'file' | 'media') => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (selectedFiles.length + files.length > FILE_LIMITS.CHAT_MAX_FILES) {
      toast.error(TOAST_MESSAGES.CHAT.FILE_LIMIT(FILE_LIMITS.CHAT_MAX_FILES));
      return;
    }

    const newFiles: { file: File; preview?: string; type: 'image' | 'video' | 'file' | 'voice' }[] = [];
    files.forEach(file => {
      let fileType: 'image' | 'video' | 'file' = 'file';
      if (type === 'image' || (type === 'media' && file.type.startsWith('image/'))) fileType = 'image';
      else if (type === 'video' || (type === 'media' && file.type.startsWith('video/'))) fileType = 'video';

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
          const mentionRegex = /@\[([^\]]+)\]/g;
          const mentions: string[] = [];
          let match;
          while ((match = mentionRegex.exec(inputText.trim())) !== null) {
            const name = match[1];
            const user = participants.find(p => p.fullName === name);
            if (user) mentions.push(user.id);
          }
          await onSendText(inputText.trim(), mentions.length > 0 ? [...new Set(mentions)] : undefined, replyingTo?.id);
        }
        setInputText('');
      }
      onCancelAction();
    } catch (error) {
      console.error("Lỗi gửi tin nhắn", error);
      toast.error(TOAST_MESSAGES.CHAT.SEND_FAILED);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(e)) return;

    if (e.key === 'Backspace') {
      const cursor = e.currentTarget.selectionStart;
      const text = e.currentTarget.value;
      const beforeCursor = text.slice(0, cursor);
      const mentionMatch = beforeCursor.match(/@\[[^\]]+\] ?$/);

      if (mentionMatch) {
        e.preventDefault();
        const deleteLength = mentionMatch[0].length;
        const newText = text.substring(0, cursor - deleteLength) + text.substring(cursor);
        setInputText(newText);
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
        <div className="flex flex-col items-center justify-center px-4 py-4 gap-3">
          <span className="text-text-tertiary text-sm">
            {isDisbanded ? 'Nhóm này đã giải tán.' : blockedMessage}
          </span>
          {isDisbanded && onDeleteConversation && (
            <Button 
              onClick={onDeleteConversation} 
              variant="danger" 
              size="sm"
              className="rounded-full px-6"
            >
              Xóa hội thoại
            </Button>
          )}
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
            onSelect={handleSelectMention}
          />
        )}

        <ActionsMenu
          isOpen={showActions}
          onToggle={() => setShowActions(!showActions)}
          onAction={(type) => {
            setShowActions(false);
            if (type === 'image') imageInputRef.current?.click();
            else if (type === 'file') fileInputRef.current?.click();
            else if (type === 'voice') startRecording();
          }}
          disabled={disabled || isSending || isRecording}
        />

        <input ref={imageInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'media')} />
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />

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
            renderOverlay={(value) => (
              <>
                {value.split(/(@\[[^\]]+\])/g).map((part, i) =>
                  part.startsWith('@[') && part.endsWith(']')
                    ? <span key={i} className="text-primary bg-primary/10 rounded box-decoration-clone">{part}</span>
                    : <span key={i}>{part}</span>
                )}
                {value.endsWith('\n') && <br />}
              </>
            )}
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
          disabled={disabled || (!inputText.trim() && selectedFiles.length === 0)}
          isLoading={isSending}
          variant={(inputText.trim() || selectedFiles.length > 0) ? 'primary' : 'secondary'}
          className={`w-11 h-11 shadow-md rounded-full flex-shrink-0 ${(inputText.trim() || selectedFiles.length > 0) ? '' : 'opacity-40'}`}
          icon={<Send size={20} className={inputText.trim() || selectedFiles.length > 0 ? 'fill-current' : ''} />}
        />
      </form>
    </div>
  );
};



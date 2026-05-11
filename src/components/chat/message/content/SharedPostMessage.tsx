import React, { useCallback } from 'react';
import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SharedPostPayload } from '../../../../utils/postShareMessage';
import { formatTimeOnly } from '../../../../utils/dateUtils';
import { UserAvatar } from '../../../ui';

interface SharedPostMessageProps {
  payload: SharedPostPayload;
  isMe: boolean;
  isEdited: boolean;
  timestamp: number;
  hasReactions: boolean;
}

export const SharedPostMessage: React.FC<SharedPostMessageProps> = ({
  payload, isMe, isEdited, timestamp, hasReactions,
}) => {
  const navigate = useNavigate();

  const handleOpenPost = useCallback(() => {
    if (payload.postId) { navigate(`/feed/post/${payload.postId}`); return; }
    window.open(payload.url, '_blank', 'noopener,noreferrer');
  }, [navigate, payload.postId, payload.url]);

  const borderCls = isMe ? 'border-primary/15' : 'border-border-light';
  const textBg = isMe ? 'bg-bg-message-sent' : 'bg-bg-message-received';

  return (
    <div className="flex flex-col min-w-0 w-[260px] max-w-full">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleOpenPost(); }}
        className={`w-full overflow-hidden rounded-xl border text-left transition-all duration-200 active:scale-[0.98] focus-visible:outline-none ${borderCls}`}
      >
        {/* Media preview */}
        {payload.previewMediaUrl && (
          <div className="relative w-full bg-bg-tertiary overflow-hidden" style={{ aspectRatio: '4/3', maxHeight: 180 }}>
            <img
              src={payload.previewMediaUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            {payload.previewMediaType === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <Play size={16} fill="white" className="ml-0.5 text-white" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className={`px-2.5 py-2 ${textBg} ${hasReactions ? 'pb-5' : ''}`}>
          {/* Author row */}
          <div className="flex items-center gap-2 mb-1.5">
            <UserAvatar
              userId={payload.authorId}
              name={payload.authorName}
              size="2xs"
              showStatus={false}
              showBorder={false}
            />
            <p className="text-[11px] font-semibold text-text-primary truncate">{payload.authorName}</p>
          </div>

          {/* Snippet */}
          <p className="text-[12px] leading-snug text-text-secondary line-clamp-2 break-all">
            {payload.snippet}
          </p>

          {/* Footer */}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">Xem bài viết</span>
            <span className={`text-[10px] ${isMe ? 'text-text-primary opacity-50' : 'text-text-tertiary'}`}>
              {formatTimeOnly(timestamp)}
            </span>
          </div>
        </div>
      </button>

      {isEdited && (
        <span className="mt-1 text-[10px] italic text-text-tertiary">(đã chỉnh sửa)</span>
      )}
    </div>
  );
};

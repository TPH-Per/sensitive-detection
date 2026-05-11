import React, { useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Ellipsis, Flag, PenTool, Pencil, Trash2 } from 'lucide-react';
import {
  UserAvatar, LazyImage, Skeleton, ReactionSelector,
  ReactionDisplay, ReactionDetailsModal, Dropdown, DropdownItem,
  SensitiveMediaGuard, UploadProgress,
} from '../../ui';
import { CommentInput } from './CommentInput';
import { Comment, User, ReactionType, ReportType, MediaObject } from '../../../../shared/types';
import { formatRelativeTime, formatDateTime } from '../../../utils/dateUtils';
import { TruncatedText } from '../shared';
import { useCommentStore } from '../../../store';
import { useFriendIds, useFilteredReactions } from '../../../hooks';
import { REACTION_LABELS } from '../../../constants';
import { getReactionColorClass } from '../../../utils';

interface CommentItemProps {
  comment: Comment;
  postId: string;
  currentUser: User;
  users: Record<string, User>;
  replies: Record<string, Comment[]>;
  hasMoreReply: Record<string, boolean>;
  isLoadingReplyMap: Record<string, boolean>;
  variant?: 'default' | 'cinema';
  postOwnerId?: string;
  activeInputId: string | 'root';
  inputMode: 'comment' | 'reply' | 'edit';
  isReply?: boolean;
  rootAuthorId?: string;
  handleReplyClick: (comment: Comment) => void;
  handleEditClick: (comment: Comment) => void;
  handleCommentSubmit: (content: string, image?: MediaObject | File) => Promise<void>;
  handleDeleteClick: (comment: Comment) => void;
  loadReplies: (parentId: string) => Promise<void>;
  resetInput: () => void;
  onProfileClick?: () => void;
  openReportModal: (type: ReportType, id: string, userId: string) => void;
  getFilteredReplies: (
    postId: string, parentId: string, postOwnerId: string,
    currentUserId: string, friendIds: string[]
  ) => { visibleReplies: Comment[]; hiddenCount: number };
}

const CommentItemInner: React.FC<CommentItemProps> = ({
  comment, postId, currentUser, users, replies, hasMoreReply,
  isLoadingReplyMap, variant, postOwnerId, activeInputId, inputMode,
  isReply = false, rootAuthorId,
  handleReplyClick, handleEditClick, handleCommentSubmit, handleDeleteClick,
  loadReplies, resetInput, onProfileClick,
  openReportModal, getFilteredReplies,
}) => {
  const navigate = useNavigate();
  const { reactToComment, uploadingStates } = useCommentStore();
  const friendIds = useFriendIds();
  const [showReactions, setShowReactions] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  
  const uploadState = uploadingStates[comment.id];
  const isUploading = !!uploadState && !uploadState.error;
  const uploadError = uploadState?.error;

  const author = users[comment.authorId];
  const isEditing = activeInputId === comment.id && inputMode === 'edit';
  const isReplying = activeInputId === comment.id && inputMode === 'reply';
  const hasMoreR = hasMoreReply[comment.id];
  const isLoadingR = isLoadingReplyMap[comment.id];

  const { visibleReplies: filteredReplies, hiddenCount: hiddenRepliesCount } = useMemo(() =>
    getFilteredReplies(postId, comment.id, postOwnerId || '', currentUser.id, friendIds),
    [getFilteredReplies, postId, comment.id, postOwnerId, currentUser.id, friendIds, replies]
  );

  const { filteredSummary, filteredCount, currentUserReaction } = useFilteredReactions(
    comment.id, 'comment', comment.authorId, comment.reactionCount
  );

  const handleProfileNav = useCallback(() => {
    if (comment.authorId) { onProfileClick?.(); navigate(`/profile/${comment.authorId}`); }
  }, [comment.authorId, onProfileClick, navigate]);

  const handleReact = useCallback((reaction: ReactionType | 'REMOVE') => {
    reactToComment(postId, comment.id, currentUser.id, reaction, comment.parentId);
    setShowReactions(false);
  }, [postId, comment.id, comment.parentId, currentUser.id, reactToComment]);

  return (
    <div className={`${isReply ? 'ml-2 mt-1.5' : 'mt-3 px-4'} animate-fade-in`}>
      <div className="flex gap-2.5">
        <UserAvatar
          userId={comment.authorId}
          src={author?.avatar?.url}
          name={author?.fullName}
          size={isReply ? 'xs' : 'sm'}
          onClick={handleProfileNav}
        />

        <div className="flex-1 min-w-0">
          {/* Bubble + menu */}
          <div className="flex items-start gap-1.5 group/comment">
            <div className="relative inline-block max-w-full min-w-0">
              <div className={`rounded-2xl px-3.5 py-2.5 inline-block max-w-full bg-bg-secondary border border-transparent transition-colors duration-200 group-hover/comment:border-border-light/50`}>

                {/* Author row */}
                <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden mb-1">
                  <button
                    className="font-semibold text-xs text-text-primary whitespace-nowrap truncate hover:text-primary transition-colors duration-200 leading-none min-w-0"
                    onClick={handleProfileNav}
                  >
                    {author?.fullName ?? <Skeleton width={80} height={11} className="opacity-60" />}
                  </button>

                  {comment.authorId === postOwnerId && (
                    <span className="inline-flex items-center gap-0.5 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 leading-none">
                      <PenTool size={9} strokeWidth={2.5} />
                      Tác giả
                    </span>
                  )}

                  {isReply && comment.replyToUserId && users[comment.replyToUserId] && comment.replyToId !== comment.parentId && (
                    <>
                      <ChevronRight size={11} className="text-text-tertiary flex-shrink-0" />
                      <button
                        className="font-semibold text-xs text-text-primary whitespace-nowrap truncate hover:text-primary transition-colors duration-200"
                        onClick={() => {
                          onProfileClick?.();
                          const target = users[comment.replyToUserId!];
                          if (target) navigate(`/profile/${target.id}`);
                        }}
                      >
                        {users[comment.replyToUserId!]?.fullName}
                      </button>
                    </>
                  )}
                </div>

                {/* Edit mode */}
                {isEditing ? (
                  <div className="mt-1.5 min-w-0 w-full">
                    <CommentInput
                      user={{ id: currentUser.id, fullName: currentUser.fullName, avatar: currentUser.avatar }}
                      initialValue={comment.content}
                      initialImage={comment.image}
                      onSubmit={handleCommentSubmit}
                      onCancel={resetInput}
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-text-primary break-words leading-relaxed">
                      <TruncatedText
                        content={comment.content}
                        threshold={200}
                        expandClassName="text-primary font-semibold cursor-pointer hover:underline ml-1.5 text-xs"
                      />
                    </p>
                    {comment.image && (
                      <div className="mt-2 rounded-xl overflow-hidden border border-border-light relative group/media">
                        <SensitiveMediaGuard isSensitive={comment.image.isSensitive}>
                          <LazyImage
                            src={comment.image.url}
                            className={`max-h-52 w-full object-contain transition-all duration-200 ${isUploading ? 'blur-[1px] opacity-70' : ''}`}
                            alt="attach"
                          />
                        </SensitiveMediaGuard>
                        
                        {isUploading && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/5 px-4">
                            <UploadProgress 
                              progress={uploadState.progress} 
                              variant="inline"
                              className="max-w-[140px]"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {uploadError && (
                      <div className="mt-1.5 px-2 py-1 bg-error/5 border border-error/20 rounded-lg">
                        <span className="text-[10px] text-error font-medium">{uploadError}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Reaction badge — floats bottom-right of bubble */}
              {!isEditing && filteredCount > 0 && (
                <button
                  className="absolute -bottom-2.5 -right-1 transition-opacity duration-200 hover:opacity-80"
                  onClick={() => setShowReactionDetails(true)}
                >
                  <ReactionDisplay
                    reactionSummary={filteredSummary}
                    reactionCount={filteredCount}
                    variant="xs"
                    className="shadow-sm border border-bg-primary bg-bg-primary"
                  />
                </button>
              )}
            </div>

            {/* Options menu — appears on hover */}
            {!isEditing && (
              <div className="opacity-0 group-hover/comment:opacity-100 transition-opacity duration-200 pt-1.5 flex-shrink-0">
                <Dropdown
                  trigger={
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-all duration-200"
                      title="Tùy chọn"
                    >
                      <Ellipsis size={15} />
                    </button>
                  }
                  align="right"
                >
                  {comment.authorId === currentUser.id ? (
                    <>
                      <DropdownItem icon={<Pencil size={14} />} label="Chỉnh sửa" onClick={() => handleEditClick(comment)} />
                      <DropdownItem icon={<Trash2 size={14} />} label="Xóa" variant="danger" onClick={() => handleDeleteClick(comment)} />
                    </>
                  ) : (
                    <DropdownItem
                      icon={<Flag size={14} />}
                      label="Báo cáo"
                      onClick={() => openReportModal(ReportType.COMMENT, comment.id, comment.authorId)}
                    />
                  )}
                </Dropdown>
              </div>
            )}
          </div>

          {/* Meta row: time · like · reply */}
          {!isEditing && (
            <div className="flex items-center gap-3 mt-1.5 ml-1 text-xs text-text-tertiary font-medium">
              <span
                className="text-[11px] text-text-tertiary"
                title={formatDateTime(comment.createdAt)}
              >
                {formatRelativeTime(comment.createdAt)}
              </span>

              {/* Like with hover selector */}
              <div
                className="relative group/reaction-btn"
                onMouseLeave={() => setShowReactions(false)}
              >
                {showReactions && (
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1.5"
                    style={{ zIndex: 'var(--z-popover)' }}
                  >
                    <ReactionSelector
                      className="relative shadow-xl animate-fade-in"
                      size="xs"
                      autoClose={false}
                      onSelect={handleReact}
                      onClose={() => setShowReactions(false)}
                    />
                  </div>
                )}
                <button
                  onMouseEnter={() => setShowReactions(true)}
                  onClick={() => handleReact(currentUserReaction ? 'REMOVE' : ReactionType.LIKE)}
                  className={`font-semibold hover:text-text-primary transition-colors duration-200
                    ${currentUserReaction ? getReactionColorClass(currentUserReaction) : 'hover:underline'}`}
                >
                  {currentUserReaction ? REACTION_LABELS[currentUserReaction] : 'Thích'}
                </button>
              </div>

              <button
                onClick={() => handleReplyClick(comment)}
                className="font-semibold hover:text-text-primary hover:underline transition-colors duration-200"
              >
                Trả lời
              </button>
            </div>
          )}

          {/* Reply input */}
          {isReplying && (
            <div className="mt-2.5 pl-1">
              <CommentInput
                user={{ id: currentUser.id, fullName: currentUser.fullName, avatar: currentUser.avatar }}
                placeholder={`Trả lời ${author?.fullName}...`}
                onSubmit={handleCommentSubmit}
                onCancel={resetInput}
                autoFocus
              />
            </div>
          )}

          {/* Replies thread */}
          {!isReply && ((comment.replyCount || 0) > 0 || filteredReplies.length > 0) && (
            <div className="mt-2 pl-1 border-l-2 border-border-light ml-1">
              {filteredReplies.length === 0 ? (
                (comment.replyCount || 0) > 0 && (
                  <button
                    onClick={() => loadReplies(comment.id)}
                    className="flex items-center gap-1.5 text-text-secondary hover:text-primary text-xs font-semibold py-1 px-2 transition-colors duration-200"
                  >
                    <ChevronDown size={13} strokeWidth={2.5} />
                    Xem {comment.replyCount} câu trả lời
                  </button>
                )
              ) : (
                <>
                  {hiddenRepliesCount > 0 && (
                    <div className="mx-2 mb-1.5 px-2 py-1.5 bg-bg-secondary/60 rounded-lg">
                      <p className="text-[11px] text-text-tertiary italic">
                        Có {comment.replyCount || 0} phản hồi. Bạn chỉ có thể xem phản hồi của bạn bè.
                      </p>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {filteredReplies.map(reply => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        postId={postId}
                        currentUser={currentUser}
                        users={users}
                        replies={replies}
                        hasMoreReply={hasMoreReply}
                        isLoadingReplyMap={isLoadingReplyMap}
                        variant={variant}
                        postOwnerId={postOwnerId}
                        activeInputId={activeInputId}
                        inputMode={inputMode}
                        isReply
                        rootAuthorId={comment.authorId}
                        handleReplyClick={handleReplyClick}
                        handleEditClick={handleEditClick}
                        handleCommentSubmit={handleCommentSubmit}
                        handleDeleteClick={handleDeleteClick}
                        loadReplies={loadReplies}
                        resetInput={resetInput}
                        onProfileClick={onProfileClick}
                        openReportModal={openReportModal}
                        getFilteredReplies={getFilteredReplies}
                      />
                    ))}
                  </div>
                  {hasMoreR && (
                    <button
                      onClick={() => loadReplies(comment.id)}
                      disabled={isLoadingR}
                      className="text-primary hover:underline text-xs font-semibold ml-8 mt-1.5 transition-colors duration-200 disabled:opacity-50"
                    >
                      {isLoadingR
                        ? 'Đang tải...'
                        : `Xem thêm ${Math.max(0, (comment.replyCount || 0) - filteredReplies.length)} câu trả lời...`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showReactionDetails && filteredCount > 0 && (
        <ReactionDetailsModal
          isOpen={showReactionDetails}
          onClose={() => setShowReactionDetails(false)}
          sourceId={comment.id}
          sourceType="comment"
          currentUserId={currentUser.id}
        />
      )}
    </div>
  );
};

export const CommentItem = React.memo(CommentItemInner);

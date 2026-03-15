import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Ellipsis, Flag, PenTool, Pencil, Trash2 } from 'lucide-react';
import { UserAvatar, LazyImage, Skeleton, ReactionSelector, ReactionDisplay, ReactionDetailsModal, Dropdown, DropdownItem } from '../../ui';
import { CommentInput } from './CommentInput';
import { Comment, User, ReactionType, ReportType, MediaObject } from '../../../../shared/types';
import { formatRelativeTime, formatDateTime } from '../../../utils/dateUtils';
import { TruncatedText } from '../shared';
import { useCommentStore } from '../../../store/commentStore';
import { useFriendIds, useFilteredReactions } from '../../../hooks';
import { REACTION_LABELS } from '../../../constants';

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
  handleCommentSubmit: (content: string, image?: MediaObject) => Promise<void>;
  handleDeleteClick: (comment: Comment) => void;
  handleUploadMedia: (file: File) => Promise<MediaObject | undefined>;
  loadReplies: (parentId: string) => Promise<void>;
  resetInput: () => void;
  onProfileClick?: () => void;
  openReportModal: (type: ReportType, id: string, userId: string) => void;
}

const CommentItemInner: React.FC<CommentItemProps> = ({
  comment,
  postId,
  currentUser,
  users,
  replies,
  hasMoreReply,
  isLoadingReplyMap,
  variant,
  postOwnerId,
  activeInputId,
  inputMode,
  isReply = false,
  rootAuthorId,
  handleReplyClick,
  handleEditClick,
  handleCommentSubmit,
  handleDeleteClick,
  handleUploadMedia,
  loadReplies,
  resetInput,
  onProfileClick,
  openReportModal
}) => {
  const navigate = useNavigate();
  const { reactToComment } = useCommentStore();
  const friendIds = useFriendIds();

  const [showReactions, setShowReactions] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);

  const author = users[comment.authorId];
  const commentReplies = replies[comment.id] || [];
  const hasMoreR = hasMoreReply[comment.id];
  const isLoadingR = isLoadingReplyMap[comment.id];
  const isEditing = activeInputId === comment.id && inputMode === 'edit';
  const isReplying = activeInputId === comment.id && inputMode === 'reply';

  const onProfileNavigate = useCallback(() => {
    if (comment.authorId) {
      onProfileClick?.();
      navigate(`/profile/${comment.authorId}`);
    }
  }, [comment.authorId, onProfileClick, navigate]);

  const myReaction = useCommentStore(state => state.myCommentReactions[comment.id] as ReactionType | null);

  const { filteredSummary, filteredCount } = useFilteredReactions(
    comment.id,
    'comment',
    comment.authorId
  );

  const handleReact = useCallback((reaction: ReactionType | 'REMOVE') => {
    reactToComment(postId, comment.id, currentUser.id, reaction, comment.parentId);
    setShowReactions(false);
  }, [postId, comment.id, comment.parentId, currentUser.id, reactToComment]);

  return (
    <div className={`${isReply ? 'ml-2 mt-2' : 'mt-4 px-4'} animate-in fade-in slide-in-from-top-1`}>
      <div className="flex gap-3">
        <UserAvatar userId={comment.authorId} src={author?.avatar.url} name={author?.fullName} size={isReply ? 'xs' : 'sm'} onClick={onProfileNavigate} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5 group/comment">
            <div className="relative inline-block max-w-full">
              <div className={`
                rounded-2xl px-4 py-2 inline-block max-w-full shadow-sm transition-all
                ${variant === 'cinema' ? 'bg-bg-secondary py-2.5' : 'bg-bg-secondary'}
              `}>
                <div className="flex items-center gap-1.5 mb-1.5 flex-nowrap overflow-hidden">
                  <h4
                    className="font-bold text-[13px] text-text-primary whitespace-nowrap truncate cursor-pointer hover:underline leading-none min-w-0"
                    onClick={onProfileNavigate}
                  >
                    {author?.fullName
                      ? author.fullName
                      : <Skeleton width={80} height={12} className="opacity-60" />}
                  </h4>
                  {comment.authorId === postOwnerId && (
                    <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 leading-none mt-[1px] flex items-center gap-0.5">
                      <PenTool size={10} className="stroke-[2.5px]" />
                      Tác giả
                    </span>
                  )}
                  {isReply && comment.parentId && users[comment.parentId] && (comment.parentId !== rootAuthorId || comment.parentId === comment.authorId) && (
                    <>
                      <ChevronRight size={12} className="text-text-tertiary flex-shrink-0 mx-0.5" />
                      <h4
                        className="font-bold text-[13px] text-text-primary whitespace-nowrap truncate cursor-pointer hover:underline"
                        onClick={() => {
                          onProfileClick?.();
                          const parentUser = users[comment.parentId!];
                          if (parentUser) navigate(`/profile/${parentUser.id}`);
                        }}
                      >
                        {users[comment.parentId!]?.fullName}
                      </h4>
                    </>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-2 min-w-[200px] md:min-w-[300px]">
                    <CommentInput
                      user={{
                        id: currentUser.id,
                        fullName: currentUser.fullName,
                        avatar: currentUser.avatar
                      }}
                      initialValue={comment.content}
                      initialImage={comment.image}
                      onSubmit={handleCommentSubmit}
                      onCancel={resetInput}
                      onUploadMedia={handleUploadMedia}
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-text-primary mt-1 break-words break-all leading-relaxed">
                      <TruncatedText
                        content={comment.content}
                        threshold={200}
                        expandClassName="text-primary font-bold cursor-pointer hover:underline ml-1.5 transition-all text-[11px] tracking-wider"
                      />
                    </div>
                    {comment.image && (
                      <div className="mt-3 rounded-xl overflow-hidden bg-bg-primary/50">
                        <LazyImage
                          src={comment.image.url}
                          className={`max-h-60 w-full object-contain ${comment.image.isSensitive ? 'blur-md' : ''}`}
                          alt="attach"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {!isEditing && (
              <div className="flex items-center opacity-0 group-hover/comment:opacity-100 transition-opacity duration-base pt-1.5">
                <Dropdown
                  trigger={
                    <button
                      className="p-1 rounded-full hover:bg-bg-hover transition-all duration-base cursor-pointer text-text-tertiary hover:text-text-primary"
                      title="Tùy chọn"
                    >
                      <Ellipsis size={16} />
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
                    <DropdownItem icon={<Flag size={14} />} label="Báo cáo" onClick={() => openReportModal(ReportType.COMMENT, comment.id, comment.authorId)} />
                  )}
                </Dropdown>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-4 mt-1 ml-2 text-[11px] text-text-tertiary font-bold h-5 leading-none">
              <span title={formatDateTime(comment.createdAt)}>{formatRelativeTime(comment.createdAt)}</span>
              <div className="relative group/reaction-btn"
                onMouseLeave={() => setShowReactions(false)}>
                {showReactions && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1.5 z-[100]">
                    <ReactionSelector
                      className="relative shadow-dropdown animate-in fade-in zoom-in-95 duration-200"
                      size="xs"
                      autoClose={false}
                      onSelect={handleReact}
                      onClose={() => setShowReactions(false)}
                    />
                  </div>
                )}
                <button
                  onMouseEnter={() => setShowReactions(true)}
                  onClick={() => handleReact(myReaction ? 'REMOVE' : ReactionType.LIKE)}
                  className={`hover:underline active:underline transition-all duration-base cursor-pointer ${myReaction ? 'text-primary' : ''}`}
                >
                  {myReaction ? REACTION_LABELS[myReaction] : 'Thích'}
                </button>
              </div>
              <button onClick={() => handleReplyClick(comment)} className="hover:underline active:underline transition-all duration-base cursor-pointer">Trả lời</button>
              {filteredCount > 0 && (
                <ReactionDisplay
                  reactionSummary={filteredSummary}
                  reactionCount={filteredCount}
                  variant="xs"
                  className="bg-transparent border-none shadow-none px-0 py-0 hover:bg-transparent"
                  onClick={() => setShowReactionDetails(true)}
                />
              )}
            </div>
          )}

          {isReplying && (
            <div className="mt-3 pl-2">
              <CommentInput
                user={{
                  id: currentUser.id,
                  fullName: currentUser.fullName,
                  avatar: currentUser.avatar
                }}
                placeholder={`Trả lời ${author?.fullName}...`}
                onSubmit={handleCommentSubmit}
                onCancel={resetInput}
                onUploadMedia={handleUploadMedia}
                autoFocus
              />
            </div>
          )}

          {!isReply && ((comment.replyCount || 0) > 0 || commentReplies.length > 0) && (
            <div className="mt-2 pl-2 border-l-2 border-border-light ml-2">
              {commentReplies.length === 0 ? (
                (comment.replyCount || 0) > 0 && (
                  <button onClick={() => loadReplies(comment.id)} className="flex items-center gap-1.5 text-text-secondary hover:text-primary text-[12px] font-bold py-1 px-2">
                    <ChevronDown size={14} className="stroke-[3px]" /> Xem {comment.replyCount} trả lời
                  </button>
                )
              ) : (
                <>
                  <div className="space-y-1">
                    {commentReplies.map(reply => (
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
                        handleUploadMedia={handleUploadMedia}
                        loadReplies={loadReplies}
                        resetInput={resetInput}
                        onProfileClick={onProfileClick}
                        openReportModal={openReportModal}
                      />
                    ))}
                  </div>
                  {hasMoreR && (
                    <button
                      onClick={() => loadReplies(comment.id)}
                      className="text-primary hover:underline text-[10px] font-bold ml-10 mt-2 tracking-wider transition-all"
                      disabled={isLoadingR}
                    >
                      {isLoadingR ? 'Đang tải...' : `Xem thêm ${Math.max(0, (comment.replyCount || 0) - commentReplies.length)} trả lời`}
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
          authorId={comment.authorId}
          context="POST"
          friendsIds={friendIds}
        />
      )}
    </div>
  );
};

export const CommentItem = React.memo(CommentItemInner);

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, AlertTriangle, CheckCircle, XCircle, Trash2,
  User as UserIcon, MessageSquare, FileText, Clock, ShieldAlert,
} from 'lucide-react';
import {
  Report, ReportStatus, ReportType, User, UserStatus,
  Post, Comment, PostStatus, CommentStatus,
} from '../../../shared/types';
import { reportService } from '../../services/reportService';
import { userService } from '../../services/userService';
import { postService } from '../../services/postService';
import { commentService } from '../../services/commentService';
import { Button, UserAvatar, Skeleton, IconButton, ConfirmDialog, MediaViewer } from '../ui';
import { PostMediaGrid } from '../feed/shared/PostMediaGrid';
import { REPORT_CONFIG, TOAST_MESSAGES } from '../../constants';
import { formatRelativeTime, formatDateTime } from '../../utils/dateUtils';
import { toast } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';

interface ReportDetailModalProps {
  reportId: string;
  onClose: () => void;
}

type ActionType = 'resolve' | 'reject' | 'warn' | 'ban';

interface ViewerState {
  isOpen: boolean;
  media: { type: 'image' | 'video'; url: string }[];
  index: number;
}

const VIEWER_CLOSED: ViewerState = { isOpen: false, media: [], index: 0 };

const TYPE_CONFIG: Record<ReportType, { label: string; icon: React.ReactNode; color: string }> = {
  [ReportType.POST]: { label: 'Bài viết', icon: <FileText size={13} />, color: 'bg-info/10 text-info' },
  [ReportType.COMMENT]: { label: 'Bình luận', icon: <MessageSquare size={13} />, color: 'bg-warning/10 text-warning' },
  [ReportType.USER]: { label: 'Người dùng', icon: <UserIcon size={13} />, color: 'bg-error/10 text-error' },
};

const ACTION_CONFIRM: Record<ActionType, { title: string; message: string; variant: 'danger' | 'primary' }> = {
  resolve: { title: 'Xác nhận xóa nội dung', message: 'Nội dung vi phạm sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.', variant: 'danger' },
  reject: { title: 'Bỏ qua báo cáo', message: 'Báo cáo sẽ được đóng lại, nội dung vẫn được giữ nguyên.', variant: 'primary' },
  warn: { title: 'Gửi cảnh báo', message: 'Người dùng sẽ nhận được cảnh báo về hành vi vi phạm.', variant: 'primary' },
  ban: { title: 'Khóa tài khoản', message: 'Tài khoản sẽ bị KHÓA và đăng xuất khỏi mọi thiết bị ngay lập tức.', variant: 'danger' },
};

/* ── Status badge ── */
const StatusBadge: React.FC<{ status: ReportStatus }> = ({ status }) => {
  const map: Record<ReportStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    [ReportStatus.PENDING]: { icon: <Clock size={11} />, label: 'Chờ xử lý', cls: 'bg-warning/10 text-warning' },
    [ReportStatus.RESOLVED]: { icon: <CheckCircle size={11} />, label: 'Đã xử lý', cls: 'bg-success/10 text-success' },
    [ReportStatus.REJECTED]: { icon: <XCircle size={11} />, label: 'Đã từ chối', cls: 'bg-bg-tertiary text-text-secondary' },
  };
  const { icon, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      {icon} {label}
    </span>
  );
};

/* ── User row ── */
const UserRow: React.FC<{ user: User | null; isLoading: boolean }> = ({ user, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3 bg-bg-secondary/40 rounded-xl">
        <Skeleton variant="circle" width={32} height={32} />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 p-3 bg-bg-secondary/40 rounded-xl">
      <UserAvatar userId={user?.id ?? ''} src={user?.avatar?.url} name={user?.fullName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary truncate">{user?.fullName}</p>
        <p className="text-xs text-text-tertiary truncate">{user?.email}</p>
      </div>
    </div>
  );
};

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({ reportId, onClose }) => {
  const { user: currentUser } = useAuthStore();
  const [report, setReport] = useState<Report | null>(null);
  const [reporter, setReporter] = useState<User | null>(null);
  const [targetOwner, setTargetOwner] = useState<User | null>(null);
  const [content, setContent] = useState<Post | Comment | null>(null);
  const [resolver, setResolver] = useState<User | null>(null);
  const [deleter, setDeleter] = useState<User | null>(null);
  const [viewer, setViewer] = useState<ViewerState>(VIEWER_CLOSED);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await reportService.getReportById(reportId);
        if (!data) { toast.error(TOAST_MESSAGES.REPORT.NOT_FOUND); onClose(); return; }
        setReport(data);

        const [rep, owner, res] = await Promise.all([
          userService.getUserById(data.reporterId),
          userService.getUserById(data.targetOwnerId),
          data.resolvedBy ? userService.getUserById(data.resolvedBy) : Promise.resolve(null),
        ]);
        setReporter(rep);
        setTargetOwner(owner);
        if (res) setResolver(res);

        if (data.targetType === ReportType.POST) {
          const post = await postService.getPostByIdForAdmin(data.targetId);
          setContent(post);
          if (post?.status === PostStatus.DELETED && post.deletedBy) {
            userService.getUserById(post.deletedBy).then(setDeleter);
          }
        } else if (data.targetType === ReportType.COMMENT) {
          const comment = await commentService.getCommentById(data.targetId, true);
          setContent(comment);
          if (comment?.status === CommentStatus.DELETED && comment.deletedBy) {
            userService.getUserById(comment.deletedBy).then(setDeleter);
          }
        }
      } catch {
        toast.error(TOAST_MESSAGES.REPORT.LOAD_DETAIL_FAILED);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [reportId, onClose]);

  const handleAction = useCallback(async () => {
    if (!report || !pendingAction || !currentUser) return;
    setIsProcessing(true);
    try {
      if (pendingAction === 'resolve') {
        await reportService.resolveReport(report.id, 'Đã xử lý xóa nội dung', 'delete_content');
        toast.success(TOAST_MESSAGES.REPORT.RESOLVE_SUCCESS);
      } else if (pendingAction === 'warn') {
        await reportService.resolveReport(report.id, 'Đã gửi cảnh báo', 'warn_user');
        toast.success(TOAST_MESSAGES.REPORT.WARN_SUCCESS);
      } else if (pendingAction === 'ban') {
        await reportService.resolveReport(report.id, 'Đã khóa tài khoản', 'ban_user');
        toast.success(TOAST_MESSAGES.REPORT.BAN_SUCCESS);
      } else if (pendingAction === 'reject') {
        await reportService.rejectReport(report.id);
        toast.success(TOAST_MESSAGES.REPORT.REJECT_SUCCESS);
      }
      onClose();
    } catch {
      toast.error(TOAST_MESSAGES.REPORT.PROCESS_FAILED);
    } finally {
      setIsProcessing(false);
      setPendingAction(null);
    }
  }, [report, pendingAction, currentUser, onClose]);

  const openViewer = useCallback((media: ViewerState['media'], index = 0) => {
    setViewer({ isOpen: true, media, index });
  }, []);

  if (!report && !isLoading) return null;
  if (!currentUser) return null;

  const reasonConfig = report
    ? REPORT_CONFIG.REASONS[report.reason as keyof typeof REPORT_CONFIG.REASONS]
    : null;
  const typeConfig = report ? TYPE_CONFIG[report.targetType] : null;
  const isPending = report?.status === ReportStatus.PENDING;
  const isContentReport = report?.targetType !== ReportType.USER;
  const isDeleted = content && 'status' in content && content.status === 'deleted';

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        style={{ zIndex: 'var(--z-modal)' }}
        onClick={onClose}
      >
        <div
          className="bg-bg-primary w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-xl border border-border-light flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Modal header ── */}
          <div className="px-5 py-4 border-b border-border-light flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-error/10 rounded-xl flex items-center justify-center text-error flex-shrink-0">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary leading-tight">Chi tiết báo cáo</h2>
                {isLoading
                  ? <Skeleton className="h-3 w-28 mt-1" />
                  : <p className="text-xs text-text-tertiary mt-0.5">
                    {report ? formatDateTime(report.createdAt) : ''}
                  </p>
                }
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isLoading && report && <StatusBadge status={report.status} />}
              <IconButton icon={<X size={18} />} onClick={onClose} variant="ghost" size="sm" />
            </div>
          </div>

          {/* ── Body: 2 columns ── */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">

            {/* LEFT: Reported content */}
            <div className="flex-1 overflow-y-auto scroll-hide p-5 space-y-5 lg:border-r border-border-light min-w-0">

              {/* Type + reason */}
              {isLoading ? (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-6 w-32 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {typeConfig && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${typeConfig.color}`}>
                        {typeConfig.icon} {typeConfig.label}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-error/10 text-error">
                      <AlertTriangle size={11} /> {reasonConfig?.label}
                    </span>
                  </div>
                  {reasonConfig?.description && (
                    <p className="text-sm text-text-secondary">{reasonConfig.description}</p>
                  )}
                  {report?.description && (
                    <div className="p-3 bg-bg-secondary rounded-xl border border-dashed border-border-light">
                      <p className="text-sm text-text-secondary italic">"{report.description}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* Reported content body */}
              {isLoading ? (
                <div className="space-y-2.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-36 w-full rounded-xl" />
                </div>
              ) : isContentReport ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">
                      Nội dung bị báo cáo
                    </p>
                    {isDeleted && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error/10 text-error rounded-full text-[10px] font-bold uppercase">
                        <Trash2 size={9} /> Đã xóa
                      </span>
                    )}
                  </div>

                  {content ? (
                    <div className={`bg-bg-secondary/50 p-4 rounded-xl border ${isDeleted ? 'border-error/20' : 'border-border-light'}`}>
                      {isDeleted && deleter && (
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border-light/50 text-xs text-text-tertiary">
                          <span className="font-semibold uppercase tracking-wide">Xóa bởi:</span>
                          <UserAvatar userId={deleter.id} src={deleter.avatar?.url} name={deleter.fullName} size="xs" />
                          <span className="font-semibold text-text-secondary">{deleter.fullName}</span>
                          {content.deletedAt && (
                            <span className="ml-auto">{formatRelativeTime(content.deletedAt)}</span>
                          )}
                        </div>
                      )}
                      {content.content
                        ? <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{content.content}</p>
                        : <p className="text-sm text-text-tertiary italic">(Không có nội dung văn bản)</p>
                      }
                      {report?.targetType === ReportType.POST && (
                        <div className="mt-4">
                          <PostMediaGrid
                            media={(content as Post).media ?? []}
                            onClick={() => openViewer(
                              ((content as Post).media ?? []).map(m => ({
                                type: m.mimeType.startsWith('video') ? 'video' as const : 'image' as const,
                                url: m.url,
                              }))
                            )}
                          />
                        </div>
                      )}
                      {report?.targetType === ReportType.COMMENT && (content as Comment).image && (
                        <button
                          type="button"
                          className="mt-4 w-full aspect-video rounded-xl bg-black overflow-hidden cursor-pointer group relative outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          onClick={() => openViewer([{ type: 'image', url: (content as Comment).image!.url }])}
                        >
                          <img
                            src={(content as Comment).image!.url}
                            className="w-full h-full object-contain"
                            alt="Ảnh bình luận bị báo cáo"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-semibold uppercase tracking-wider">
                            Xem cỡ lớn
                          </div>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 bg-bg-secondary/30 rounded-xl border border-dashed border-border-light">
                      <Trash2 size={24} className="text-text-tertiary opacity-30 mb-2" />
                      <p className="text-sm text-text-tertiary">Nội dung đã bị xóa hoặc không còn tồn tại</p>
                    </div>
                  )}
                </div>
              ) : (
                /* User report */
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">
                    Tài khoản bị báo cáo
                  </p>
                  <div className="flex items-center gap-3.5 p-4 bg-bg-secondary/50 rounded-xl border border-border-light">
                    <UserAvatar userId={targetOwner?.id ?? ''} src={targetOwner?.avatar?.url} name={targetOwner?.fullName} size="lg" />
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-text-primary truncate">{targetOwner?.fullName}</p>
                      <p className="text-sm text-text-tertiary truncate">{targetOwner?.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Evidence images */}
              {!isLoading && report?.images && report.images.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">
                    Hình ảnh bằng chứng ({report.images.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {report.images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="aspect-square rounded-xl overflow-hidden border border-border-light bg-bg-secondary group cursor-pointer relative outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        onClick={() => openViewer(report.images!.map(m => ({ type: 'image' as const, url: m.url })), idx)}
                      >
                        <img
                          src={img.url}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          alt={`Bằng chứng ${idx + 1}`}
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-semibold uppercase tracking-wide">
                          Xem ảnh
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Metadata + Actions */}
            <div className="w-full lg:w-[300px] flex-shrink-0 flex flex-col overflow-y-auto scroll-hide border-t lg:border-t-0 border-border-light">
              <div className="p-5 space-y-4 flex-1">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">Người báo cáo</p>
                  <UserRow user={reporter} isLoading={isLoading} />
                </div>

                {isContentReport && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">Chủ nội dung</p>
                    <UserRow user={targetOwner} isLoading={isLoading} />
                  </div>
                )}

                {/* Resolution result */}
                {!isLoading && report && !isPending && (
                  <div className={`p-3.5 rounded-xl border space-y-2.5
                    ${report.status === ReportStatus.RESOLVED
                      ? 'bg-success/5 border-success/20'
                      : 'bg-bg-secondary/40 border-border-light'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {report.status === ReportStatus.RESOLVED
                          ? <CheckCircle size={15} className="text-success" />
                          : <XCircle size={15} className="text-text-secondary" />
                        }
                        <span className={`text-sm font-semibold ${report.status === ReportStatus.RESOLVED ? 'text-success' : 'text-text-secondary'}`}>
                          {report.status === ReportStatus.RESOLVED ? 'Đã xử lý' : 'Đã từ chối'}
                        </span>
                      </div>
                      {report.resolvedAt && (
                        <span className="text-xs text-text-tertiary">
                          {formatRelativeTime(report.resolvedAt)}
                        </span>
                      )}
                    </div>
                    {resolver && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border-light/50">
                        <span className="text-xs text-text-tertiary font-medium">Xử lý bởi:</span>
                        <UserAvatar userId={resolver.id} src={resolver.avatar?.url} name={resolver.fullName} size="xs" />
                        <span className="text-xs font-semibold text-text-primary">{resolver.fullName}</span>
                      </div>
                    )}
                    {report.resolution && (
                      <p className="text-xs text-text-secondary italic bg-bg-primary/50 px-3 py-2 rounded-lg">
                        "{report.resolution}"
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action footer */}
              {!isLoading && (
                <div className="p-4 border-t border-border-light bg-bg-secondary/20 space-y-2">
                  {isPending ? (
                    <>
                      <Button
                        variant="secondary"
                        fullWidth
                        disabled={isProcessing}
                        onClick={() => setPendingAction('reject')}
                      >
                        Bỏ qua báo cáo
                      </Button>
                      <div className="flex gap-2">
                        {report?.targetType === ReportType.USER ? (
                          targetOwner?.status === UserStatus.BANNED ? (
                            <div className="flex-1 px-3 py-2 bg-error/5 text-error rounded-xl border border-error/20 text-xs font-semibold text-center">
                              Tài khoản đã bị khóa
                            </div>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                className="flex-1 border-warning/30 text-warning hover:bg-warning/10"
                                disabled={isProcessing}
                                onClick={() => setPendingAction('warn')}
                              >
                                Cảnh báo
                              </Button>
                              <Button
                                variant="danger"
                                className="flex-1"
                                isLoading={isProcessing}
                                onClick={() => setPendingAction('ban')}
                              >
                                Khóa TK
                              </Button>
                            </>
                          )
                        ) : (
                          <Button
                            variant={isDeleted ? 'secondary' : 'danger'}
                            fullWidth
                            isLoading={isProcessing}
                            onClick={() => setPendingAction('resolve')}
                          >
                            {isDeleted ? 'Xác nhận & Đóng' : 'Xóa nội dung vi phạm'}
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <Button variant="secondary" fullWidth onClick={onClose}>
                      Đóng
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingAction && (
        <ConfirmDialog
          isOpen
          onClose={() => setPendingAction(null)}
          onConfirm={handleAction}
          title={ACTION_CONFIRM[pendingAction].title}
          message={ACTION_CONFIRM[pendingAction].message}
          variant={ACTION_CONFIRM[pendingAction].variant}
        />
      )}

      <MediaViewer
        media={viewer.media}
        initialIndex={viewer.index}
        isOpen={viewer.isOpen}
        onClose={() => setViewer(VIEWER_CLOSED)}
      />
    </>
  );
};

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User as UserIcon,
  Trash2,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Report, ReportStatus, ReportType, User, Post, Comment, PostStatus, CommentStatus } from '../../../shared/types';
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

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({ reportId, onClose }) => {
  const { user: currentUser } = useAuthStore();
  const [report, setReport] = useState<Report | null>(null);
  const [reporter, setReporter] = useState<User | null>(null);
  const [targetOwner, setTargetOwner] = useState<User | null>(null);
  const [content, setContent] = useState<Post | Comment | null>(null);
  const [resolver, setResolver] = useState<User | null>(null);
  const [deleter, setDeleter] = useState<User | null>(null);

  const [viewerState, setViewerState] = useState({
    isOpen: false,
    media: [] as { type: 'image' | 'video'; url: string }[],
    index: 0
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [actionType, setActionType] = useState<'resolve' | 'reject' | 'warn' | 'ban' | 'unban' | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      try {
        const reportData = await reportService.getReportById(reportId);
        if (!reportData) {
          toast.error(TOAST_MESSAGES.REPORT.NOT_FOUND);
          onClose();
          return;
        }
        setReport(reportData);

        const fetchTasks: Promise<User | null>[] = [
          userService.getUserById(reportData.reporterId),
          userService.getUserById(reportData.targetOwnerId)
        ];

        if (reportData.resolvedBy) {
          fetchTasks.push(userService.getUserById(reportData.resolvedBy));
        }

        const [reporterData, ownerData, resolverData] = await Promise.all(fetchTasks);
        setReporter(reporterData);
        setTargetOwner(ownerData);
        if (resolverData) setResolver(resolverData);

        if (reportData.targetType === ReportType.POST) {
          const postData = await postService.getPostByIdForAdmin(reportData.targetId);
          setContent(postData);
          if (postData?.status === PostStatus.DELETED && postData.deletedBy) {
            userService.getUserById(postData.deletedBy).then(setDeleter);
          }
        } else if (reportData.targetType === ReportType.COMMENT) {
          const commentData = await commentService.getCommentById(reportData.targetId);
          setContent(commentData);
          if (commentData?.status === CommentStatus.DELETED && commentData.deletedBy) {
            userService.getUserById(commentData.deletedBy).then(setDeleter);
          }
        }
      } catch (error) {
        toast.error(TOAST_MESSAGES.REPORT.LOAD_DETAIL_FAILED);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
  }, [reportId, onClose]);

  const handleAction = async () => {
    if (!report || !actionType || !currentUser) return;
    setIsProcessing(true);
    try {
      if (actionType === 'resolve') {
        await reportService.resolveReport(report.id, 'Đã xử lý xóa nội dung', 'delete_content');
        toast.success(TOAST_MESSAGES.REPORT.RESOLVE_SUCCESS);
      } else if (actionType === 'warn') {
        await reportService.resolveReport(report.id, 'Đã gửi cảnh báo', 'warn_user');
        toast.success(TOAST_MESSAGES.REPORT.WARN_SUCCESS);
      } else if (actionType === 'ban') {
        await reportService.resolveReport(report.id, 'Đã khóa tài khoản', 'ban_user');
        toast.success(TOAST_MESSAGES.REPORT.BAN_SUCCESS);
      } else if (actionType === 'reject') {
        await reportService.rejectReport(report.id);
        toast.success(TOAST_MESSAGES.REPORT.REJECT_SUCCESS);
      }
      onClose();
    } catch (error) {
      toast.error(TOAST_MESSAGES.REPORT.PROCESS_FAILED);
    } finally {
      setIsProcessing(false);
      setShowConfirm(false);
    }
  };

  if (!report && !isLoading) return null;
  const reasonConfig = report ? REPORT_CONFIG.REASONS[report.reason as keyof typeof REPORT_CONFIG.REASONS] : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[var(--z-modal)] flex items-center justify-center p-4">
      <div
        className="bg-bg-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-xl border border-border-light flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-error/5 rounded-lg text-error">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Chi tiết vi phạm</h2>
              {!report && isLoading && <Skeleton className="h-3 w-20 mt-1" />}
            </div>
          </div>
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            variant="secondary"
            className="hover:bg-bg-secondary rounded-full"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isLoading ? (
            <div className="space-y-8 animate-pulse">
              <div className="bg-bg-secondary/50 p-4 rounded-2xl border border-border-light text-center space-y-2">
                <Skeleton className="h-6 w-1/2 mx-auto" />
                <Skeleton className="h-4 w-3/4 mx-auto" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-bg-secondary/30 rounded-2xl border border-border-light space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circle" width={32} height={32} />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2 w-1/2" />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-bg-secondary/30 rounded-2xl border border-border-light space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circle" width={32} height={32} />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2 w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-32 w-full rounded-2xl" />
              </div>
            </div>
          ) : (
            <>
              {/* Reason Card */}
              <div className="bg-bg-secondary/50 p-4 rounded-2xl border border-border-light text-center">
                <h3 className="text-lg font-black text-error mb-1 capitalize">{reasonConfig?.label}</h3>
                <p className="text-xs text-text-secondary">{reasonConfig?.description}</p>
                {report?.description && (
                  <div className="mt-4 p-3 bg-bg-primary/50 rounded-xl border border-dashed border-border-light italic text-xs text-text-secondary">
                    "{report.description}"
                  </div>
                )}
              </div>

              {/* Users Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-bg-secondary/30 rounded-2xl border border-border-light space-y-3">
                  <span className="text-[9px] font-black text-text-tertiary uppercase tracking-widest block">Người báo cáo</span>
                  <div className="flex items-center gap-3">
                    <UserAvatar userId={reporter?.id || ''} src={reporter?.avatar?.url} name={reporter?.fullName} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-primary truncate">{reporter?.fullName}</div>
                      <div className="text-[10px] text-text-tertiary truncate">{reporter?.email}</div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-bg-secondary/30 rounded-2xl border border-border-light space-y-3">
                  <span className="text-[9px] font-black text-text-tertiary uppercase tracking-widest block">Bị khiếu nại</span>
                  <div className="flex items-center gap-3">
                    <UserAvatar userId={targetOwner?.id || ''} src={targetOwner?.avatar?.url} name={targetOwner?.fullName} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-primary truncate">{targetOwner?.fullName}</div>
                      <div className="text-[10px] text-text-tertiary truncate">{targetOwner?.email}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Evidence Images */}
              {report?.images && report.images.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-text-tertiary uppercase tracking-widest">Hình ảnh bằng chứng</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {report.images.map((img, idx) => (
                      <div
                        key={idx}
                        className="aspect-square rounded-xl overflow-hidden border border-border-light bg-bg-secondary group cursor-pointer relative"
                        onClick={() => setViewerState({
                          isOpen: true,
                          media: (report.images || []).map(mediaObj => ({ type: 'image' as const, url: mediaObj.url })),
                          index: idx
                        })}
                      >
                        <img src={img.url} className="w-full h-full object-cover transition-all duration-base" />
                        <div className="absolute inset-0 bg-black/20 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-base flex items-center justify-center text-white text-[10px] font-bold uppercase">Xem ảnh</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution Info if processed */}
              {report && report.status !== ReportStatus.PENDING && (
                <div className={`p-5 rounded-2xl border ${report.status === ReportStatus.RESOLVED
                  ? 'bg-success/5 border-success/20'
                  : 'bg-text-secondary/5 border-border-light'
                  } space-y-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {report.status === ReportStatus.RESOLVED ? (
                        <CheckCircle className="text-success" size={18} />
                      ) : (
                        <XCircle className="text-text-secondary" size={18} />
                      )}
                      <span className={`text-sm font-bold ${report.status === ReportStatus.RESOLVED ? 'text-success' : 'text-text-secondary'
                        }`}>
                        {report.status === ReportStatus.RESOLVED ? 'Đã xử lý' : 'Đã từ chối'}
                      </span>
                    </div>
                    {report.resolvedAt && (
                      <span className="text-[10px] text-text-tertiary font-medium">
                        {formatDateTime(report.resolvedAt)}
                      </span>
                    )}
                  </div>

                  {resolver && (
                    <div className="flex items-center gap-2 pt-3 border-t border-border-light/50">
                      <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-wider">Người xử lý:</span>
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={resolver.id} src={resolver.avatar?.url} name={resolver.fullName} size="xs" />
                        <span className="text-xs font-bold text-text-primary">{resolver.fullName}</span>
                      </div>
                    </div>
                  )}

                  {report.resolution && (
                    <div className="bg-bg-primary/50 p-3 rounded-xl border border-border-light/50">
                      <p className="text-xs text-text-secondary italic">"{report.resolution}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* Violated Content - Only show for POST/COMMENT reports */}
              {report?.targetType !== ReportType.USER && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-text-tertiary uppercase tracking-widest">Nội dung vi phạm</h4>
                    {content?.status === 'deleted' && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-error/10 text-error rounded-full border border-error/20">
                        <Trash2 size={10} />
                        <span className="text-[10px] font-bold uppercase">Nội dung đã bị xóa</span>
                      </div>
                    )}
                  </div>
                  
                  {content ? (
                    <div className={`bg-bg-primary p-5 rounded-2xl border ${content.status === 'deleted' ? 'border-error/20 bg-error/[0.02]' : 'border-border-light shadow-sm'}`}>
                      {content.status === 'deleted' && (
                        <div className="mb-4 pb-4 border-b border-border-light/50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-wider">Người xóa:</span>
                            {deleter ? (
                              <div className="flex items-center gap-1.5">
                                <UserAvatar userId={deleter.id} src={deleter.avatar?.url} name={deleter.fullName} size="xs" />
                                <span className="text-xs font-bold text-text-primary">{deleter.fullName}</span>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-text-secondary">Người dùng hoặc Hệ thống</span>
                            )}
                          </div>
                          {content.deletedAt && (
                            <span className="text-[10px] text-text-tertiary font-medium">
                              {formatRelativeTime(content.deletedAt)}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{content.content}</p>

                      {/* Media if any */}
                      {report?.targetType === ReportType.POST && content && (
                        <div className="mt-4">
                          <PostMediaGrid
                            media={(content as Post).media || []}
                            onClick={() => setViewerState({
                              isOpen: true,
                              media: (content as Post).media?.map(m => ({ type: m.mimeType.startsWith('video') ? 'video' as const : 'image' as const, url: m.url })) || [],
                              index: 0
                            })}
                          />
                        </div>
                      )}

                      {report?.targetType === ReportType.COMMENT && content && (content as Comment).image && (
                        <div
                          className="mt-4 aspect-video rounded-xl bg-black overflow-hidden cursor-pointer group relative"
                          onClick={() => setViewerState({
                            isOpen: true,
                            media: [{ type: 'image' as const, url: (content as Comment).image!.url }],
                            index: 0
                          })}
                        >
                          <img src={(content as Comment).image!.url} className="w-full h-full object-contain transition-all duration-base" />
                          <div className="absolute inset-0 bg-black/20 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-base flex items-center justify-center text-white text-xs font-bold uppercase tracking-widest">Xem ảnh cỡ lớn</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-bg-secondary/20 rounded-2xl border border-dashed border-border-light">
                      <Trash2 size={32} className="mx-auto text-text-tertiary opacity-30 mb-2" />
                      <p className="text-xs font-medium text-text-tertiary">Nội dung đã bị xóa hoặc không còn tồn tại</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-bg-secondary/30 border-t border-border-light flex gap-3">
          {isLoading ? (
            <>
              <Skeleton className="flex-1 h-10 rounded-xl" />
              <Skeleton className="flex-1 h-10 rounded-xl" />
              <Skeleton className="flex-1 h-10 rounded-xl" />
            </>
          ) : report && report.status === ReportStatus.PENDING ? (
            <>
              <Button
                variant="secondary"
                className="flex-1 rounded-xl font-bold"
                onClick={() => { setActionType('reject'); setShowConfirm(true); }}
              >
                Bỏ qua
              </Button>
              {report.targetType === ReportType.USER ? (
                <>
                  <Button
                    variant="danger"
                    className="flex-1 rounded-xl font-bold"
                    onClick={() => { setActionType('warn'); setShowConfirm(true); }}
                  >
                    Cảnh báo
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1 rounded-xl font-bold text-white shadow-lg shadow-error/20"
                    onClick={() => { setActionType('ban'); setShowConfirm(true); }}
                  >
                    Khóa TK
                  </Button>
                </>
              ) : (
                <Button
                  variant={content.status === 'deleted' ? 'secondary' : 'primary'}
                  className="flex-[2] rounded-xl font-bold shadow-lg shadow-primary/20"
                  onClick={() => { setActionType('resolve'); setShowConfirm(true); }}
                >
                  {content.status === 'deleted' ? 'Xác nhận & Đóng báo cáo' : 'Xử lý & Xóa nội dung'}
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="secondary"
              className="flex-1 rounded-xl font-bold"
              onClick={onClose}
            >
              Đóng
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleAction}
        title="Xác nhận xử lý"
        message="Hành động này sẽ thay đổi trạng thái và thực hiện các biện pháp kỷ luật tương ứng."
      />

      {/* Lightbox - Image Viewer */}
      <MediaViewer
        media={viewerState.media}
        initialIndex={viewerState.index}
        isOpen={viewerState.isOpen}
        onClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

import React, { useRef, useEffect, useState } from 'react';
import { X, Image as ImageIcon, Video, Users, Lock, Globe2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserAvatar, Button, EmojiPicker, Select, Modal, IconButton, ConfirmDialog } from '../../ui';
import { toast } from '../../../store/toastStore';
import { validateFile } from '../../../utils';
import { User, Post, Visibility, MediaObject, PostType } from '../../../../shared/types';
import { postSchema, PostFormValues } from '../../../utils/validation';
import { MEDIA_CONSTRAINTS, TOAST_MESSAGES } from '../../../constants';
import { insertTextAtCursor } from '../../../utils/uiUtils';
import { useAutoResizeTextarea } from '../../../hooks/utils';
import { useAuthStore } from '../../../store/authStore';
import { useLinkPreview } from '../../../hooks/useLinkPreview';
import { LinkPreviewCard } from '../../shared/LinkPreviewCard';

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  initialPost?: Post;
  initialFiles?: File[];
  onSubmit: (
    content: string,
    media: MediaObject[],
    visibility: Visibility,
    pendingFiles?: File[]
  ) => void | Promise<void>;
}

const EMPTY_FILES: File[] = [];

export const PostModal: React.FC<PostModalProps> = ({
  isOpen, onClose, currentUser, initialPost,
  initialFiles = EMPTY_FILES, onSubmit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  const isEdit = !!initialPost;
  const isSystemPost = initialPost?.type === PostType.AVATAR_UPDATE || initialPost?.type === PostType.COVER_UPDATE;

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { isSubmitting, isValid, isDirty },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: '', media: [], hasPendingFiles: false,
      visibility: Visibility.FRIENDS,
      type: PostType.REGULAR,
    },
  });

  const formData = watch();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ url: string; type: 'image' | 'video' }[]>([]);


  const linkPreview = useLinkPreview(isEdit ? '' : (formData.content || ''));

  useEffect(() => {
    if (isOpen && !initializedRef.current) {
      if (isEdit && initialPost) {
        reset({
          content: initialPost.content,
          media: initialPost.media || [],
          hasPendingFiles: false,
          visibility: initialPost.visibility,
          type: initialPost.type,
        });
      } else {
        const defaultVisibility =
          useAuthStore.getState().settings?.defaultPostVisibility || Visibility.FRIENDS;
        reset({
          content: '', media: [],
          hasPendingFiles: initialFiles.length > 0,
          visibility: defaultVisibility,
        });
        if (initialFiles.length > 0) processFiles(initialFiles);
      }
      initializedRef.current = true;
    }
    if (!isOpen && initializedRef.current) {
      initializedRef.current = false;
      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPreviews([]);
      setPendingFiles([]);
    }
  }, [isOpen, isEdit, initialPost?.id, initialFiles, reset]);

  useAutoResizeTextarea(textareaRef, formData.content || '', isOpen);

  const processFiles = (files: File[]) => {
    if (files.length === 0) return;
    const validFiles: File[] = [];
    const newPreviews: { url: string; type: 'image' | 'video' }[] = [];

    files.forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) {
        toast.error(`Không hỗ trợ định dạng file của "${file.name}"`);
        return;
      }
      const validation = validateFile(file, isImage ? 'IMAGE' : 'VIDEO');
      if (validation.isValid) {
        validFiles.push(file);
        newPreviews.push({ url: URL.createObjectURL(file), type: isImage ? 'image' : 'video' });
      } else if (validation.error) {
        toast.error(validation.error);
      }
    });

    if (validFiles.length === 0) return;

    const currentTotal = formData.media.length + pendingFiles.length;
    const remainingSlots = MEDIA_CONSTRAINTS.MAX_IMAGES_PER_POST - currentTotal;
    if (remainingSlots <= 0) {
      toast.error(TOAST_MESSAGES.POST.MEDIA_LIMIT(MEDIA_CONSTRAINTS.MAX_IMAGES_PER_POST));
      return;
    }

    const existingVideoCount =
      formData.media.filter(m => m.mimeType.startsWith('video/')).length +
      pendingFiles.filter(f => f.type.startsWith('video/')).length;
    const remainingVideoSlots = MEDIA_CONSTRAINTS.MAX_VIDEOS_PER_POST - existingVideoCount;
    const newVideos = validFiles.filter(f => f.type.startsWith('video/'));

    let processedFiles = validFiles;
    let processedPreviews = newPreviews;

    if (newVideos.length > 0 && remainingVideoSlots <= 0) {
      toast.error(TOAST_MESSAGES.POST.VIDEO_LIMIT(MEDIA_CONSTRAINTS.MAX_VIDEOS_PER_POST));
      processedFiles = validFiles.filter(f => !f.type.startsWith('video/'));
      processedPreviews = newPreviews.filter(p => p.type !== 'video');
    } else if (newVideos.length > remainingVideoSlots) {
      toast.error(TOAST_MESSAGES.POST.VIDEO_LIMIT(MEDIA_CONSTRAINTS.MAX_VIDEOS_PER_POST));
      let videosAdded = 0;
      const tempFiles: File[] = [];
      const tempPreviews: { url: string; type: 'image' | 'video' }[] = [];
      processedFiles.forEach((f, i) => {
        if (f.type.startsWith('video/')) {
          if (videosAdded < remainingVideoSlots) {
            tempFiles.push(f); tempPreviews.push(processedPreviews[i]); videosAdded++;
          } else URL.revokeObjectURL(processedPreviews[i].url);
        } else { tempFiles.push(f); tempPreviews.push(processedPreviews[i]); }
      });
      processedFiles = tempFiles;
      processedPreviews = tempPreviews;
    }

    if (processedFiles.length === 0) return;

    let filesToAdd = processedFiles;
    if (processedFiles.length > remainingSlots) {
      toast.error(TOAST_MESSAGES.POST.MEDIA_LIMIT(MEDIA_CONSTRAINTS.MAX_IMAGES_PER_POST));
      processedPreviews.slice(remainingSlots).forEach(p => URL.revokeObjectURL(p.url));
      filesToAdd = processedFiles.slice(0, remainingSlots);
      processedPreviews = processedPreviews.slice(0, remainingSlots);
    }

    const allFiles = [...pendingFiles, ...filesToAdd];
    setPendingFiles(allFiles);
    setPreviews(prev => [...prev, ...processedPreviews]);
    setValue('hasPendingFiles', allFiles.length > 0, { shouldDirty: true, shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleRemoveMedia = (index: number) => {
    setValue('media', formData.media.filter((_, i) => i !== index), { shouldDirty: true });
  };

  const handleRemovePending = (index: number) => {
    if (previews[index]) URL.revokeObjectURL(previews[index].url);
    const newFiles = pendingFiles.filter((_, i) => i !== index);
    setPendingFiles(newFiles);
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setValue('hasPendingFiles', newFiles.length > 0, { shouldDirty: true, shouldValidate: true });
  };

  const onFormSubmit = (data: PostFormValues) => {
    // Kích hoạt gửi bài và đóng modal ngay lập tức
    onSubmit(
      data.content || '', data.media, data.visibility,
      pendingFiles
    );
    onClose();
  };

  const handleCloseAttempt = () => {
    const hasContent = !!formData.content?.trim();
    const hasMedia = formData.media.length > 0 || pendingFiles.length > 0;
    if (hasContent || hasMedia) setShowDiscardConfirm(true);
    else onClose();
  };

  if (!isOpen) return null;

  const allPreviews = [
    ...formData.media.map(m => ({
      url: m.url,
      type: m.mimeType.startsWith('video/') ? 'video' as const : 'image' as const,
      thumbnail: m.thumbnailUrl,
      isPending: false,
    })),
    ...previews.map(p => ({ ...p, thumbnail: undefined, isPending: true })),
  ];

  const isLargeText =
    (formData.content?.length || 0) < 85 &&
    formData.media.length === 0 &&
    previews.length === 0;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title={isSystemPost ? 'Chỉnh sửa quyền riêng tư' : isEdit ? 'Chỉnh sửa bài viết' : 'Tạo bài viết'}
        maxWidth="2xl"
        padding="none"
        fullScreen="mobile"
        footer={
          <div className="w-full space-y-3">
            {/* Media toolbar */}
            {!isSystemPost && (
              <div className="flex items-center justify-between bg-bg-secondary rounded-xl px-3 py-2 border border-border-light">
                <span className="text-xs font-semibold text-text-secondary">Thêm vào bài viết</span>
                <div className="flex gap-0.5">
                  <IconButton
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Ảnh"
                    disabled={isSubmitting}
                    icon={<ImageIcon size={19} className="text-success" />}
                    size="md"
                  />
                  <IconButton
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    title="Video"
                    disabled={isSubmitting}
                    icon={<Video size={19} className="text-info" />}
                    size="md"
                  />
                  <EmojiPicker
                    onEmojiSelect={(emoji) =>
                      insertTextAtCursor(
                        textareaRef, formData.content || '', emoji,
                        (t) => setValue('content', t, { shouldDirty: true, shouldValidate: true })
                      )
                    }
                    disabled={isSubmitting}
                    size={19}
                    buttonSize="md"
                    iconClassName="text-warning"
                  />
                </div>
                <input
                  ref={fileInputRef} type="file" accept="image/*" multiple
                  onChange={(e) => processFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <input
                  ref={videoInputRef} type="file" accept="video/*" multiple
                  onChange={(e) => processFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleSubmit(onFormSubmit)}
              disabled={isSubmitting || !isValid || (isEdit && !isDirty && pendingFiles.length === 0)}
              isLoading={isSubmitting}
            >
              {isEdit ? 'Lưu thay đổi' : 'Đăng bài'}
            </Button>


          </div>
        }
      >
        <div className="flex flex-col min-h-[150px]">
          {/* Author + visibility row */}
          <div
            className="sticky top-0 bg-bg-primary px-4 md:px-6 py-3 border-b border-border-light flex items-center justify-between flex-shrink-0"
            style={{ zIndex: 'var(--z-sticky)' }}
          >
            <div className="flex items-center gap-3">
              <UserAvatar
                userId={currentUser.id}
                src={currentUser.avatar?.url}
                name={currentUser.fullName}
                size="md"
                initialStatus={currentUser.status}
              />
              <span className="font-semibold text-text-primary text-sm">
                {currentUser.fullName}
              </span>
            </div>
            <Select
              value={formData.visibility}
              onChange={(v) => setValue('visibility', v as Visibility, { shouldDirty: true, shouldValidate: true })}
              options={[
                { value: Visibility.PUBLIC, label: 'Công khai', icon: <Globe2 size={13} /> },
                { value: Visibility.FRIENDS, label: 'Bạn bè', icon: <Users size={13} /> },
                { value: Visibility.PRIVATE, label: 'Chỉ mình tôi', icon: <Lock size={13} /> },
              ]}
              size="sm"
              className="flex-none min-w-[148px]"
            />
          </div>

          {/* Body */}
          <div className="flex-1 px-4 md:px-6 pt-4 pb-6">
            {!isSystemPost && (
              <textarea
                {...register('content')}
                ref={(e) => {
                  register('content').ref(e);
                  (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                }}
                placeholder="Hãy viết gì đó..."
                className={`w-full resize-none outline-none bg-transparent text-text-primary placeholder:text-text-tertiary overflow-hidden transition-all duration-200 leading-relaxed
                  ${isLargeText
                    ? 'text-xl md:text-2xl font-medium min-h-[120px]'
                    : 'text-base md:text-lg min-h-[80px]'
                  }`}
                disabled={isSubmitting}
                autoFocus
              />
            )}

            {/* Link preview in composer */}
            {!isEdit && linkPreview.url && !linkPreview.isDismissed && allPreviews.length === 0 && (
              <LinkPreviewCard
                url={linkPreview.url}
                previewData={linkPreview.isLoading ? undefined : linkPreview.previewData}
                onDismiss={linkPreview.dismiss}
                compact
                className="mb-3"
              />
            )}

            {/* Media grid preview */}
            {allPreviews.length > 0 && (
              <div className={`grid gap-2 mt-4 ${allPreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {allPreviews.map((item, idx) => {
                  const isLarge = allPreviews.length === 3 && idx === 0;
                  return (
                    <div
                      key={`${item.url}-${idx}`}
                      className={`relative group rounded-xl overflow-hidden bg-bg-secondary border border-border-light
                        ${isLarge ? 'col-span-2 aspect-video' : 'aspect-square md:aspect-video'}`}
                    >
                      {item.type === 'image' ? (
                        <img
                          src={item.url} alt=""
                          className={`w-full h-full object-cover transition-opacity duration-200 ${isSubmitting && item.isPending ? 'opacity-50' : ''}`}
                        />
                      ) : (
                        <>
                          <video
                            src={item.url}
                            poster={item.thumbnail}
                            className={`w-full h-full object-cover ${isSubmitting && item.isPending ? 'opacity-50' : ''}`}
                            playsInline muted preload="none"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                            <Video className="text-white/80" size={28} />
                          </div>
                        </>
                      )}



                      {!isSubmitting && !isSystemPost && (
                        <button
                          type="button"
                          onClick={() => {
                            if (item.isPending) {
                              const pIdx = previews.findIndex(p => p.url === item.url);
                              if (pIdx !== -1) handleRemovePending(pIdx);
                            } else {
                              const mIdx = formData.media.findIndex(m => m.url === item.url);
                              if (mIdx !== -1) handleRemoveMedia(mIdx);
                            }
                          }}
                          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-30"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => { setShowDiscardConfirm(false); onClose(); }}
        title="Hủy bỏ bài viết?"
        message="Nội dung bạn đang soạn sẽ bị mất. Bạn có chắc chắn muốn thoát?"
        confirmLabel="Hủy bỏ"
        cancelLabel="Tiếp tục soạn"
        variant="primary"
      />
    </>
  );
};

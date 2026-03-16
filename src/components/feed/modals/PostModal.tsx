import React, { useRef, useEffect } from 'react';
import { X, Image as ImageIcon, Video, Globe, Users, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserAvatar, Button, EmojiPicker, Select, Modal, IconButton, ConfirmDialog } from '../../ui';
import { CircularProgressOverlay } from '../../ui/CircularProgress';
import { toast } from '../../../store/toastStore';
import { validateFileSize } from '../../../utils';
import { User, Post, Visibility, MediaObject } from '../../../../shared/types';
import { postSchema, PostFormValues } from '../../../utils/validation';
import { insertTextAtCursor } from '../../../utils/uiUtils';
import { useAutoResizeTextarea } from '../../../hooks/utils';
import { userService } from '../../../services/userService';

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  initialPost?: Post;
  initialFiles?: File[];
  onSubmit: (content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => Promise<void>;
  onUploadImages: (files: File[], onProgress?: (progress: number) => void) => Promise<MediaObject[]>;
}

const EMPTY_FILES: File[] = [];

export const PostModal: React.FC<PostModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialPost,
  initialFiles = EMPTY_FILES,
  onSubmit,
  onUploadImages
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEdit = !!initialPost;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isSubmitting, isValid, isDirty }
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: '',
      media: [],
      hasPendingFiles: false,
      visibility: Visibility.PUBLIC
    }
  });

  const formData = watch();
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false);

  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<{ url: string; type: 'image' | 'video' }[]>([]);

  const initializedRef = React.useRef(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await userService.getUserSettings(currentUser.id);
        if (settings) {
          setValue('visibility', settings.defaultPostVisibility);
        }
      } catch (error) {
        console.error('Lỗi lấy settings mặc định:', error);
      }
    };

    if (isOpen && !initializedRef.current) {
      if (isEdit && initialPost) {
        reset({
          content: initialPost.content,
          media: initialPost.media || [],
          hasPendingFiles: false,
          visibility: initialPost.visibility
        });
      } else {
        reset({
          content: '',
          media: [],
          hasPendingFiles: initialFiles.length > 0,
          visibility: Visibility.PUBLIC // Giá trị tạm thời
        });
        fetchSettings(); // Ghi đè bằng settings từ DB
        if (initialFiles.length > 0) processFiles(initialFiles);
      }
      initializedRef.current = true;
    }

    if (!isOpen && initializedRef.current) {
      initializedRef.current = false;
      if (previews.length > 0) {
        previews.forEach(p => URL.revokeObjectURL(p.url));
        setPreviews([]);
      }
      if (pendingFiles.length > 0) {
        setPendingFiles([]);
      }
    }
  }, [isOpen, isEdit, initialPost?.id, initialFiles, reset]);

  useAutoResizeTextarea(textareaRef, formData.content || '', isOpen);

  const processFiles = (files: File[]) => {
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const newPreviews: { url: string; type: 'image' | 'video' }[] = [];

    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const validation = validateFileSize(file, 'IMAGE');
        if (validation.isValid) {
          validFiles.push(file);
          newPreviews.push({ url: URL.createObjectURL(file), type: 'image' });
        } else {
          if (validation.error) toast.error(validation.error);
        }
      } else if (file.type.startsWith('video/')) {
        const validation = validateFileSize(file, 'VIDEO');
        if (validation.isValid) {
          validFiles.push(file);
          newPreviews.push({ url: URL.createObjectURL(file), type: 'video' });
        } else {
          if (validation.error) toast.error(validation.error);
        }
      } else {
        toast.error(`Không hỗ trợ định dạng file của "${file.name}"`);
      }
    });

    if (validFiles.length === 0) return;

    // Chỉ lưu file vào state, không upload ngay
    const allFiles = [...pendingFiles, ...validFiles];
    setPendingFiles(allFiles);
    setPreviews(prev => [...prev, ...newPreviews]);
    setValue('hasPendingFiles', allFiles.length > 0, { shouldValidate: true });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    processFiles(files);
  };

  const handleRemoveMedia = (index: number) => {
    setValue('media', formData.media.filter((_, i) => i !== index), { shouldDirty: true });
  };

  // Xóa pending file (chưa upload)
  const handleRemovePending = (index: number) => {
    if (previews[index]) {
      URL.revokeObjectURL(previews[index].url);
    }
    const newFiles = pendingFiles.filter((_, i) => i !== index);
    setPendingFiles(newFiles);
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setValue('hasPendingFiles', newFiles.length > 0, { shouldValidate: true });
  };

  const onFormSubmit = async (data: PostFormValues) => {
    try {
      await onSubmit(
        data.content || '',
        data.media,
        data.visibility,
        pendingFiles
      );

      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPendingFiles([]);
      setPreviews([]);
      
      onClose();
    } catch (error) {
      console.error('[PostModal] Lỗi khi đăng bài:', error);
    }
  };

  const handleCloseAttempt = () => {
    const hasContent = !!formData.content?.trim();
    const hasMedia = formData.media.length > 0 || pendingFiles.length > 0;

    if (hasContent || hasMedia) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseAttempt}
        title={isEdit ? 'Chỉnh sửa bài viết' : 'Tạo bài viết'}
        maxWidth="2xl"
        padding="none"
        fullScreen="mobile"
        footer={
          <div className="w-full">
            {/* Media Actions */}
            <div className="flex items-center justify-between mb-4 bg-bg-secondary p-2.5 md:p-3 rounded-xl border border-border-light shadow-sm">
              <span className="text-[13px] md:text-sm font-semibold text-text-secondary leading-none">Thêm vào bài viết</span>
              <div className="flex gap-0.5 md:gap-1">
                <IconButton
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group rounded-full"
                  title="Ảnh"
                  disabled={isSubmitting}
                  icon={<ImageIcon className="text-success transition-all duration-base" size={20} />}
                  size="md"
                />
                <IconButton
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="group rounded-full"
                  title="Video"
                  disabled={isSubmitting}
                  icon={<Video className="text-info transition-all duration-base" size={20} />}
                  size="md"
                />
                <div className="flex items-center">
                  <EmojiPicker
                    buttonClassName="hover:bg-bg-hover rounded-full group w-11 h-11 flex items-center justify-center transition-all duration-base"
                    onEmojiSelect={(emoji) => {
                      insertTextAtCursor(textareaRef, formData.content || '', emoji, (newText) => {
                        setValue('content', newText, { shouldDirty: true });
                      });
                    }}
                    disabled={isSubmitting}
                    size={22}
                    buttonSize="lg"
                    iconClassName="text-warning transition-all duration-base"
                  />
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
              <input ref={videoInputRef} type="file" accept="video/*" multiple onChange={handleFileSelect} className="hidden" />
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full text-[15px] font-bold shadow-sm"
              onClick={handleSubmit(onFormSubmit)}
              disabled={isSubmitting || !isValid}
              isLoading={isSubmitting}
            >
              {isEdit ? 'Lưu thay đổi' : 'Đăng bài'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col min-h-[150px]">
          <div className="sticky top-[-1px] z-10 bg-bg-primary px-4 md:px-6 py-3 border-b border-divider flex items-center justify-between flex-none">
            <div className="flex items-center gap-3">
              <UserAvatar userId={currentUser.id} src={currentUser.avatar.url} name={currentUser.fullName} size="md" initialStatus={currentUser.status} />
              <h3 className="font-semibold text-text-primary text-sm md:text-base">{currentUser.fullName}</h3>
            </div>
            <Select
              value={formData.visibility}
              onChange={(v) => setValue('visibility', v as Visibility, { shouldDirty: true })}
              options={[
                { value: Visibility.PUBLIC, label: 'Công khai', icon: <Globe size={14} /> },
                { value: Visibility.FRIENDS, label: 'Bạn bè', icon: <Users size={14} /> },
                { value: Visibility.PRIVATE, label: 'Chỉ mình tôi', icon: <Lock size={14} /> }
              ]}
              size="sm"
              className="flex-none min-w-[150px]"
            />
          </div>

          <div className="flex-1 px-4 md:px-6 pt-3 md:pt-4 pb-6">
            <div className="relative group">
              <textarea
                {...register('content')}
                ref={(e) => {
                  register('content').ref(e);
                  (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                }}
                placeholder="Hãy viết gì đó..."
                className={`w-full resize-none outline-none bg-transparent text-text-primary placeholder:text-text-tertiary overflow-hidden transition-all duration-200 ${(formData.content?.length || 0) < 85 && formData.media.length === 0 && previews.length === 0
                  ? 'text-xl md:text-2xl font-medium min-h-[120px]'
                  : 'text-base md:text-lg min-h-[100px]'
                  }`}
                disabled={isSubmitting}
                autoFocus
              />
            </div>


            {/* Media Preview Section */}
            {(() => {
              const allPreviews = [
                ...formData.media.map(m => ({ url: m.url, type: m.mimeType.startsWith('video/') ? 'video' as const : 'image' as const, isPending: false })),
                ...previews.map(p => ({ ...p, isPending: true }))
              ];

              if (allPreviews.length === 0) return null;

              const count = allPreviews.length;
              const gridClass = count === 1 ? 'grid-cols-1' : 'grid-cols-2';

              return (
                <div className={`grid ${gridClass} gap-2 mt-4`}>
                  {allPreviews.map((item, idx) => {
                    const isLarge = count === 3 && idx === 0;
                    return (
                      <div
                        key={`${item.url}-${idx}`}
                        className={`relative group rounded-xl overflow-hidden bg-bg-secondary border border-border-light shadow-sm ${isLarge ? 'col-span-2 aspect-video' : 'aspect-square md:aspect-video'
                          }`}
                      >
                        {item.type === 'image' ? (
                          <img src={item.url} alt="" className={`w-full h-full object-cover ${isSubmitting && item.isPending ? 'opacity-60' : ''}`} />
                        ) : (
                          <>
                            <video src={item.url} className={`w-full h-full object-cover ${isSubmitting && item.isPending ? 'opacity-60' : ''}`} playsInline muted />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Video className="text-white/80" size={32} />
                            </div>
                          </>
                        )}

                        {isSubmitting && item.isPending && (
                          <CircularProgressOverlay
                            isVisible={true}
                            progress={0}
                            size={40}
                            showPercentage={false}
                          />
                        )}

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
                          className="absolute top-2 right-2 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-base hover:bg-black/70 active:bg-black/90 z-30"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        title="Hủy bỏ bài viết?"
        message="Nội dung bạn đang soạn sẽ bị mất. Bạn có chắc chắn muốn thoát?"
        confirmLabel="Hủy bỏ"
        cancelLabel="Tiếp tục soạn"
        variant="primary"
      />
    </>
  );
};

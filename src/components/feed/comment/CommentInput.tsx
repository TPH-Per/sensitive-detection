import React, { useRef, useEffect } from 'react';
import { Image as ImageIcon, X, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserAvatar, IconButton, Button, EmojiPicker } from '../../ui';
import { CircularProgressOverlay } from '../../ui/CircularProgress';
import { validateFileSize } from '../../../utils';
import { toast } from '../../../store/toastStore';
import { commentSchema, CommentFormValues } from '../../../utils/validation';
import { insertTextAtCursor } from '../../../utils/uiUtils';
import { useAutoResizeTextarea } from '../../../hooks/utils';
import { MEDIA_CONSTRAINTS } from '../../../constants';
import { MediaObject } from '../../../../shared/types';

interface CommentInputProps {
  user: {
    id: string;
    fullName: string;
    avatar?: MediaObject;
  };
  placeholder?: string;
  initialValue?: string;
  initialImage?: MediaObject;
  onSubmit: (content: string, image?: MediaObject) => Promise<void>;
  onCancel?: () => void;
  onUploadMedia: (file: File) => Promise<MediaObject>;
  autoFocus?: boolean;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  user,
  placeholder = 'Viết bình luận...',
  initialValue = '',
  initialImage,
  onSubmit,
  onCancel,
  onUploadMedia,
  autoFocus = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: initialValue,
      image: initialImage?.url || undefined
    }
  });

  const formData = watch();
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  // State cho file pending (chưa upload) và preview blob URL
  const [pendingImage, setPendingImage] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Initialize preview from initialImage if it's a MediaObject
  useEffect(() => {
    if (initialImage && typeof initialImage === 'object' && 'url' in initialImage) {
      setValue('image', initialImage.url);
    }
  }, [initialImage, setValue]);

  // Adjust textarea height
  useAutoResizeTextarea(textareaRef, formData.content || '');

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Kiểm tra giới hạn số ảnh
    const hasImage = formData.image || previewUrl;
    if (hasImage && MEDIA_CONSTRAINTS.MAX_IMAGES_PER_COMMENT <= 1) {
      toast.error(`Chỉ được đăng tối đa ${MEDIA_CONSTRAINTS.MAX_IMAGES_PER_COMMENT} ảnh`);
      return;
    }

    const validation = validateFileSize(file, 'IMAGE');
    if (!validation.isValid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    // Chỉ lưu file và tạo preview, không upload ngay
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (e.target) e.target.value = '';
  };

  const handleFormSubmit = async (data: CommentFormValues) => {
    const submittedData = { ...data };

    // Upload pending image khi submit
    let imageMedia: MediaObject | undefined = undefined;
    if (pendingImage) {
      setIsUploading(true);
      setUploadProgress(0);
      try {
        imageMedia = await onUploadMedia(pendingImage);
        setUploadProgress(100);
      } catch (error) {
        setIsUploading(false);
        setUploadProgress(0);
        return;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    } else if (submittedData.image) {
      // If there's an existing image URL (from initialImage), wrap it as MediaObject
      // This is a fallback - ideally initialImage should already be MediaObject
      imageMedia = typeof initialImage === 'object' && 'url' in initialImage
        ? initialImage
        : undefined;
    }

    // Cleanup
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingImage(null);
    setPreviewUrl(null);
    reset();

    try {
      await onSubmit(submittedData.content || '', imageMedia);
    } catch (error) {
      console.error('Lỗi gửi bình luận:', error);
    }
  };

  const handleRemoveMedia = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingImage(null);
    setPreviewUrl(null);
    setValue('image', undefined, { shouldDirty: true });
  };

  return (
    <div className="flex gap-3">
      <UserAvatar userId={user.id} src={user.avatar?.url} name={user.fullName} size="xs" />
      <div className="flex-1 min-w-0">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="bg-bg-secondary rounded-2xl transition-all duration-base p-2"
        >
          <textarea
            {...register('content')}
            ref={(e) => {
              register('content').ref(e);
              (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
            }}
            placeholder={placeholder}
            rows={1}
            className="w-full bg-transparent border-none outline-none text-sm resize-none py-1 placeholder:text-text-tertiary max-h-32 custom-scrollbar"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(handleFormSubmit)();
              }
              if (e.key === 'Escape' && onCancel) {
                onCancel();
              }
            }}
          />

          {(formData.image || previewUrl || isUploading) && (
            <div className="mt-2 relative inline-block">
              {(formData.image || previewUrl) ? (
                <div className="relative group">
                  <img
                    src={previewUrl || formData.image}
                    alt="Preview"
                    className={`h-20 w-auto rounded-lg object-cover ${isUploading ? 'opacity-60' : ''}`}
                  />
                  <CircularProgressOverlay
                    isVisible={isUploading}
                    progress={uploadProgress}
                    size={36}
                    showPercentage={false}
                  />
                  {previewUrl && !isUploading && (
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white/80">
                      Chưa tải
                    </div>
                  )}
                  {!isUploading && (
                    <IconButton
                      type="button"
                      onClick={handleRemoveMedia}
                      className="absolute -top-2 -right-2 bg-text-primary text-bg-primary shadow-md"
                      size="sm"
                      icon={<X size={12} />}
                    />
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between mt-1 pt-1">
            <div className="flex items-center gap-1">
              <IconButton
                type="button"
                className="text-text-tertiary hover:text-success active:text-success"
                onClick={() => fileInputRef.current?.click()}
                icon={<ImageIcon size={16} />}
                size="sm"
                title="Thêm ảnh"
                disabled={isSubmitting || isUploading}
              />
              <EmojiPicker
                onEmojiSelect={(emoji) => {
                  insertTextAtCursor(textareaRef, formData.content || '', emoji, (newText) => {
                    setValue('content', newText, { shouldDirty: true });
                  });
                }}
                size={16}
                disabled={isSubmitting || isUploading}
              />
            </div>
            <div className="flex items-center gap-1">
              {onCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className="!h-auto !py-1.5 !px-2.5 text-xs font-semibold"
                >
                  Hủy
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                disabled={(!isDirty && !pendingImage) || isSubmitting || isUploading}
                isLoading={isSubmitting}
                className="w-9 h-9 rounded-full shadow-sm p-0 flex-shrink-0"
                icon={<Send size={16} className="fill-current" />}
              />
            </div>
          </div>
        </form>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleMediaUpload(e)} />
      </div>
    </div>
  );
};

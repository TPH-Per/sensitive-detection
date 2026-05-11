import React, { useRef, useEffect, useState } from 'react';
import { Image as ImageIcon, X, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserAvatar, IconButton, Button, EmojiPicker } from '../../ui';
import { validateFile } from '../../../utils';
import { toast } from '../../../store/toastStore';
import { commentSchema, CommentFormValues } from '../../../utils/validation';
import { insertTextAtCursor } from '../../../utils/uiUtils';
import { useAutoResizeTextarea } from '../../../hooks/utils';
import { MEDIA_CONSTRAINTS } from '../../../constants';
import { MediaObject } from '../../../../shared/types';

interface CommentInputProps {
  user: { id: string; fullName: string; avatar?: MediaObject };
  placeholder?: string;
  initialValue?: string;
  initialImage?: MediaObject;
  onSubmit: (content: string, image?: MediaObject | File) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  user,
  placeholder = 'Viết bình luận...',
  initialValue = '',
  initialImage,
  onSubmit,
  onCancel,
  autoFocus = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { isDirty } } = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: initialValue,
      image: initialImage?.url || undefined,
      hasPendingImage: false,
    },
  });

  const formData = watch();
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (initialImage && 'url' in initialImage) setValue('image', initialImage.url);
  }, [initialImage, setValue]);

  useAutoResizeTextarea(textareaRef, formData.content || '');

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if ((formData.image || previewUrl) && MEDIA_CONSTRAINTS.MAX_IMAGES_PER_COMMENT <= 1) {
      toast.error(`Chỉ được đăng tối đa ${MEDIA_CONSTRAINTS.MAX_IMAGES_PER_COMMENT} ảnh`);
      return;
    }

    const validation = validateFile(file, 'IMAGE');
    if (!validation.isValid) { if (validation.error) toast.error(validation.error); return; }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setValue('hasPendingImage', true, { shouldValidate: true, shouldDirty: true });
    e.target.value = '';
  };

  const handleFormSubmit = (data: CommentFormValues) => {
    let imageToSubmit: MediaObject | File | undefined = pendingImage || undefined;

    if (!imageToSubmit && data.image && initialImage && 'url' in initialImage) {
      imageToSubmit = initialImage;
    }

    if (previewUrl) {
      // Đã có logic revoke trong store hoặc useEffect dọn dẹp
    }

    setPendingImage(null);
    setPreviewUrl(null);
    reset({ content: '', image: undefined, hasPendingImage: false });
    
    onSubmit(data.content || '', imageToSubmit);
  };

  const handleRemoveMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingImage(null);
    setPreviewUrl(null);
    setValue('image', undefined, { shouldDirty: true, shouldValidate: true });
    setValue('hasPendingImage', false, { shouldDirty: true, shouldValidate: true });
  };

  const isEdit = !!initialValue || !!initialImage;
  const canSubmit = (!!formData.content?.trim() || !!pendingImage || !!formData.image) && 
                   (!isEdit || isDirty);

  return (
    <div className="flex gap-2.5 items-end">
      <UserAvatar userId={user.id} src={user.avatar?.url} name={user.fullName} size="xs" />

      <div className="flex-1 min-w-0">
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          {/* Input bubble */}
          <div className="bg-bg-secondary border border-border-light rounded-2xl transition-all duration-200 focus-within:border-primary/30 focus-within:bg-bg-primary">
            <textarea
              {...register('content')}
              ref={(e) => {
                register('content').ref(e);
                (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
              }}
              placeholder={placeholder}
              rows={1}
              className="w-full bg-transparent border-none outline-none text-sm resize-none px-3.5 pt-2.5 pb-1 placeholder:text-text-tertiary max-h-32 scroll-hide text-text-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(handleFormSubmit)();
                }
                if (e.key === 'Escape' && onCancel) onCancel();
              }}
            />

            {/* Image preview */}
            {(formData.image || previewUrl) && (
              <div className="px-3 pb-2">
                <div className="relative inline-block">
                  {(formData.image || previewUrl) && (
                    <div className="relative group/img">
                      <img
                        src={previewUrl || formData.image}
                        alt="Preview"
                        className="h-20 w-auto rounded-xl object-cover border border-border-light"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveMedia}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-text-primary text-bg-primary rounded-full flex items-center justify-center shadow-md transition-colors duration-200 hover:bg-text-secondary"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-0.5">
                <IconButton
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<ImageIcon size={15} />}
                  size="sm"
                  title="Thêm ảnh"
                  disabled={false}
                  className="text-text-tertiary hover:text-success"
                />
                <EmojiPicker
                  onEmojiSelect={(emoji) =>
                    insertTextAtCursor(
                      textareaRef,
                      formData.content || '',
                      emoji,
                      (t) => setValue('content', t, { shouldDirty: true })
                    )
                  }
                  size={15}
                  disabled={false}
                />
              </div>

              <div className="flex items-center gap-1">
                {onCancel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="!h-7 !py-0 !px-2.5 text-xs"
                  >
                    Hủy
                  </Button>
                )}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0
                    ${canSubmit
                      ? 'btn-gradient text-white shadow-sm hover:brightness-110 active:brightness-95'
                      : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed'
                    }`}
                >
                  <Send size={14} className={canSubmit ? 'fill-current' : ''} />
                </button>
              </div>
            </div>
          </div>
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleMediaUpload}
        />
      </div>
    </div>
  );
};

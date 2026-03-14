import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Video } from 'lucide-react';
import { PostModal } from './modals/PostModal';
import { User, Visibility, MediaObject } from '../../../shared/types';
import { Avatar, Button, Skeleton } from '../ui';
import { usePostStore } from '../../store/postStore';
import { postService } from '../../services/postService';

interface CreatePostProps {
  currentUser: User;
}

export const CreatePost: React.FC<CreatePostProps> & { Skeleton: React.FC } = ({ currentUser }) => {
  const { createPost } = usePostStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const onMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(files);
      setShowCreateModal(true);
    }
    e.target.value = '';
  };

  const handleCreatePost = async (
    content: string,
    media: MediaObject[],
    visibility: Visibility,
    pendingFiles?: File[]
  ) => {
    await createPost(currentUser.id, content, media, visibility, pendingFiles);
    setPendingFiles([]);
  };

  const handleUploadImages = async (files: File[], onProgress?: (progress: number) => void) => {
    return await postService.uploadPostMedia(files, currentUser.id, (progress) => {
      onProgress?.(progress);
    });
  };

  return (
    <>
      <div className="bg-bg-primary rounded-xl p-3 sm:p-4 shadow-sm border border-border-light transition-theme mb-4">
        <div className="flex gap-3 mb-4">
          <Avatar src={currentUser.avatar.url} name={currentUser.fullName} size="md" />
          <Button
            variant="secondary"
            onClick={() => setShowCreateModal(true)}
            className="flex-1 justify-start text-text-secondary font-medium border-none rounded-full text-sm sm:text-base truncate"
          >
            <span className="truncate">{currentUser.fullName} ơi, bạn đang nghĩ gì thế?</span>
          </Button>
        </div>

        <div className="flex gap-1 pt-2 border-t border-divider">
          <Button
            variant="ghost"
            onClick={() => imageInputRef.current?.click()}
            className="flex-1 group px-2 min-h-[44px]"
            icon={<ImageIcon className="text-success transition-all duration-base" size={20} />}
          >
            <span className="text-xs sm:text-[15px] font-semibold">Ảnh</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => videoInputRef.current?.click()}
            className="flex-1 group px-2 min-h-[44px]"
            icon={<Video className="text-info transition-all duration-base" size={20} />}
          >
            <span className="text-xs sm:text-[15px] font-semibold">Video</span>
          </Button>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onMediaSelect}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={onMediaSelect}
        />
      </div>

      <PostModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setPendingFiles([]);
        }}
        currentUser={currentUser}
        initialFiles={pendingFiles}
        onSubmit={handleCreatePost}
        onUploadImages={handleUploadImages}
      />
    </>
  );
};

CreatePost.Skeleton = () => (
  <div className="bg-bg-primary rounded-xl p-3 sm:p-4 shadow-sm border border-border-light transition-theme mb-4">
    <div className="flex gap-3 mb-4">
      <Skeleton variant="circle" width={40} height={40} />
      <div className="flex-1">
        <Skeleton variant="rect" height={40} className="w-full rounded-full" />
      </div>
    </div>
    <div className="flex gap-1 pt-2 border-t border-divider">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex-1 flex justify-center py-2">
          <Skeleton width={60} height={16} />
        </div>
      ))}
    </div>
  </div>
);

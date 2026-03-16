import React, { useState, useMemo } from 'react';
import { RtdbMessage, MediaObject } from '../../../../shared/types';
import { Image, Film, FileText, Download, ExternalLink } from 'lucide-react';
import { LazyImage } from '../../ui';
import { downloadFile } from '../../../utils';

interface ChatDetailsMediaProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
}

type MediaTab = 'images' | 'videos' | 'files';

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ChatDetailsMediaInner: React.FC<ChatDetailsMediaProps> = ({ messages }) => {
  const [activeTab, setActiveTab] = useState<MediaTab>('images');

  const mediaItems = useMemo(() => {
    const images: Array<{ key: string; media: MediaObject }> = [];
    const videos: Array<{ key: string; media: MediaObject }> = [];
    const files: Array<{ key: string; media: MediaObject }> = [];

    messages.forEach((msg) => {
      if (!msg.data.media || msg.data.media.length === 0) return;

      if (msg.data.type === 'image') {
        msg.data.media.forEach((media, index) => {
          images.push({ key: `${msg.id}_${index}`, media });
        });
      } else if (msg.data.type === 'video') {
        msg.data.media.forEach((media, index) => {
          videos.push({ key: `${msg.id}_${index}`, media });
        });
      } else if (msg.data.type === 'file') {
        msg.data.media.forEach((media, index) => {
          files.push({ key: `${msg.id}_${index}`, media });
        });
      }
    });

    return { images, videos, files };
  }, [messages]);

  const tabs: { id: MediaTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'images', label: 'Ảnh', icon: <Image size={16} />, count: mediaItems.images.length },
    { id: 'videos', label: 'Video', icon: <Film size={16} />, count: mediaItems.videos.length },
    { id: 'files', label: 'File', icon: <FileText size={16} />, count: mediaItems.files.length },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'images':
        if (mediaItems.images.length === 0) {
          return <EmptyState message="Chưa có ảnh nào được chia sẻ" />;
        }
        return (
          <div className="grid grid-cols-3 gap-1 p-2">
            {mediaItems.images.map((item) => (
              <a
                key={item.key}
                href={item.media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-lg overflow-hidden hover:opacity-80 active:opacity-70 transition-all duration-base"
              >
                <LazyImage
                  src={item.media.url || ''}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        );

      case 'videos':
        if (mediaItems.videos.length === 0) {
          return <EmptyState message="Chưa có video nào được chia sẻ" />;
        }
        return (
          <div className="grid grid-cols-2 gap-2 p-2">
            {mediaItems.videos.map((item) => (
              <a
                key={item.key}
                href={item.media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-video rounded-lg overflow-hidden bg-bg-tertiary hover:opacity-80 active:opacity-70 transition-all duration-base relative group"
              >
                <video src={item.media.url} poster={item.media.thumbnailUrl} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-all duration-base">
                  <ExternalLink size={24} className="text-white" />
                </div>
              </a>
            ))}
          </div>
        );

      case 'files':
        if (mediaItems.files.length === 0) {
          return <EmptyState message="Chưa có file nào được chia sẻ" />;
        }
        return (
          <div className="space-y-1 p-2">
            {mediaItems.files.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => downloadFile(item.media.url, item.media.fileName || 'file')}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-bg-hover active:bg-bg-active transition-all duration-base text-left"
              >
                <div className="w-10 h-10 bg-primary-light rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {item.media.fileName || 'File'}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {formatFileSize(item.media.size)}
                  </p>
                </div>
                <Download size={18} className="text-text-tertiary flex-shrink-0" />
              </button>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="py-4">
      <h3 className="px-4 text-sm font-semibold text-text-secondary mb-3">
        Media & File
      </h3>

      {/* Tabs */}
      <div className="flex border-b border-border-light mx-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all duration-base relative
              ${activeTab === tab.id
                ? 'text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
              }
            `}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className="text-xs text-text-tertiary">({tab.count})</span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[300px] overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
    <p className="text-sm">{message}</p>
  </div>
);

export const ChatDetailsMedia = React.memo(ChatDetailsMediaInner);

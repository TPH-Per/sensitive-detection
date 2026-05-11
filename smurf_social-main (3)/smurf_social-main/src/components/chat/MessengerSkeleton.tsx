import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import { ConversationItem } from './conversation/ConversationItem';

/** Skeleton hiển thị cho toàn bộ trang Messenger */
export const MessengerSkeleton: React.FC = () => (
  <div className="flex h-full w-full bg-bg-primary overflow-hidden">

    {/* Sidebar Skeleton */}
    <div className="flex flex-col w-full md:w-[300px] lg:w-[360px] border-r border-border-light flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-light space-y-3">
        <div className="flex justify-between items-center h-10">
          <Skeleton width={110} height={22} />
          <Skeleton variant="circle" width={36} height={36} />
        </div>
        <Skeleton height={40} className="rounded-xl" />
        <div className="flex gap-2">
          <Skeleton width={64} height={28} className="rounded-full" />
          <Skeleton width={64} height={28} className="rounded-full" />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-hidden p-1">
        {[...Array(7)].map((_, i) => (
          <ConversationItem.Skeleton key={i} />
        ))}
      </div>
    </div>

    {/* Main Chat Skeleton Desktop */}
    <div className="hidden md:flex flex-1 flex-col bg-bg-chat">
      {/* Chat header */}
      <div className="h-16 px-4 border-b border-border-light bg-bg-primary flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" width={40} height={40} />
          <div className="space-y-1.5">
            <Skeleton width={130} height={14} />
            <Skeleton width={70} height={11} />
          </div>
        </div>
        <div className="flex gap-1.5">
          <Skeleton variant="circle" width={38} height={38} />
          <Skeleton variant="circle" width={38} height={38} />
          <Skeleton variant="circle" width={38} height={38} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 px-4 py-4 space-y-5 overflow-hidden">
        <div className="flex items-end gap-2 max-w-[70%]">
          <Skeleton variant="circle" width={30} height={30} className="flex-shrink-0 mb-0.5" />
          <div className="space-y-1.5">
            <Skeleton height={38} width={200} className="rounded-xl rounded-bl-sm" />
            <Skeleton height={38} width={150} className="rounded-xl rounded-bl-sm opacity-70" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 max-w-[70%] ml-auto">
          <Skeleton height={44} width={220} className="rounded-xl rounded-br-sm bg-primary/15" />
          <Skeleton height={120} width={220} className="rounded-xl rounded-br-sm bg-primary/15 opacity-70" />
        </div>
        <div className="flex items-end gap-2 max-w-[70%]">
          <Skeleton variant="circle" width={30} height={30} className="flex-shrink-0 mb-0.5" />
          <Skeleton height={38} width={160} className="rounded-xl rounded-bl-sm" />
        </div>
      </div>

      {/* Input */}
      <div className="p-3 md:p-4 bg-bg-primary border-t border-border-light flex-shrink-0">
        <Skeleton height={44} className="rounded-xl" />
      </div>
    </div>
  </div>
);

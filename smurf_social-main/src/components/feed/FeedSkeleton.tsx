import React from 'react';
import { PostItem } from './PostItem';
import { CreatePost } from './CreatePost';

export const FeedSkeleton: React.FC = () => (
  <div className="flex justify-center h-full w-full overflow-y-auto bg-bg-secondary transition-theme">
    <div className="w-full max-w-[680px] py-4 md:py-6 px-3 sm:px-4 md:px-0 pb-6 animate-fade-in">
      <CreatePost.Skeleton />
      <div className="space-y-3 md:space-y-4">
        {[...Array(3)].map((_, i) => <PostItem.Skeleton key={i} />)}
      </div>
    </div>
  </div>
);

import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export const ProfileSkeleton: React.FC = () => (
  <div className="h-full w-full overflow-y-auto bg-bg-secondary animate-fade-in">
    <div className="bg-bg-primary shadow-sm mb-4">
      {/* Cover */}
      <div className="relative w-full h-[200px] md:h-[320px] md:rounded-b-2xl overflow-hidden">
        <Skeleton height="100%" width="100%" />
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row items-center md:items-end text-center md:text-left -mt-14 md:-mt-16 mb-5 gap-4 md:gap-6">
          {/* Avatar */}
          <div className="relative z-20 mx-auto md:mx-0 flex-shrink-0">
            <div className="p-1 bg-bg-primary rounded-full shadow-md">
              <Skeleton variant="circle" width={128} height={128} />
            </div>
          </div>

          {/* Name */}
          <div className="flex-1 space-y-2 flex flex-col items-center md:items-start pb-1">
            <Skeleton width={200} height={32} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 md:mb-1">
            <Skeleton width={120} height={40} className="rounded-xl" />
            <Skeleton width={40} height={40} className="rounded-xl md:hidden" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border-light h-12">
          <Skeleton width={80} height={20} className="self-center mx-2" />
          <Skeleton width={80} height={20} className="self-center mx-2" />
        </div>
      </div>
    </div>

    {/* Content */}
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-12">
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Left sidebar */}
        <div className="w-full md:w-[320px] lg:w-[360px] flex-shrink-0 space-y-4">
          <div className="bg-bg-primary rounded-2xl border border-border-light p-4 space-y-4">
            <Skeleton width={100} height={20} />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3 items-center">
                <Skeleton variant="rect" width={32} height={32} className="rounded-lg flex-shrink-0" />
                <Skeleton width="65%" height={14} />
              </div>
            ))}
          </div>
          <div className="bg-bg-primary rounded-2xl border border-border-light p-4 space-y-4 hidden md:block">
            <div className="flex justify-between items-center">
              <Skeleton width={100} height={20} />
              <Skeleton width={60} height={14} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} variant="rect" className="aspect-square rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        {/* Posts */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-bg-primary rounded-2xl border border-border-light p-4">
            <Skeleton height={44} className="w-full rounded-full" />
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <Skeleton variant="circle" width={40} height={40} />
                <div className="space-y-1.5 flex-1">
                  <Skeleton width={130} height={14} />
                  <Skeleton width={80} height={11} />
                </div>
              </div>
              <div className="px-4 pb-3 space-y-2">
                <Skeleton width="88%" height={14} />
                <Skeleton width="60%" height={14} />
              </div>
              <div className="w-full aspect-video bg-bg-secondary" />
              <div className="flex px-2 py-1 border-t border-border-light">
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="flex-1 flex justify-center py-2.5">
                    <Skeleton width={64} height={16} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

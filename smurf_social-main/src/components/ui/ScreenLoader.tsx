import React from 'react';

export const ScreenLoader: React.FC = () => (
  <div
    className="fixed inset-0 flex flex-col justify-center items-center bg-bg-primary gap-6"
    style={{ zIndex: 'var(--z-toast)' }}
  >
    {/* Animated gradient cube grid */}
    <div className="grid grid-cols-2 gap-2.5 w-20 h-20 animate-rotate-loader">
      <div className="w-[35px] h-[35px] rounded-xl screen-loader-cube" />
      <div className="w-[35px] h-[35px] rounded-xl screen-loader-cube" />
      <div className="w-[35px] h-[35px] rounded-xl screen-loader-cube" />
      <div className="w-[35px] h-[35px] rounded-xl screen-loader-cube" />
    </div>
  </div>
);

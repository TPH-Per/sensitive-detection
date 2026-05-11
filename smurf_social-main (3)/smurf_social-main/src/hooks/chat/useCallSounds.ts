import { useRef, useCallback } from 'react';

import connectedSound from '../../assets/sounds/connected.mp3';
import endedSound from '../../assets/sounds/ended.mp3';

export type CallSoundType = 'connected' | 'ended';

export const useCallSounds = () => {
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const playSound = useCallback((type: CallSoundType) => {
    if (!audioRefs.current[type]) {
      let src = '';
      switch (type) {
        case 'connected': src = connectedSound; break;
        case 'ended': src = endedSound; break;
      }
      audioRefs.current[type] = new Audio(src);
    }

    const audio = audioRefs.current[type];
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn(`Không thể phát âm thanh ${type}:`, err);
    });
  }, []);

  const stopAllSounds = useCallback(() => {
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  return { playSound, stopAllSounds };
};

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeMode } from '../../shared/types';

interface ThemeState {
  mode: ThemeMode;
  toggleTheme: () => void;
  applyTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      /** Chuyển đổi chế độ giao diện */
      toggleTheme: () => {
        const newMode = get().mode === 'light' ? 'dark' : 'light';
        set({ mode: newMode });
        get().applyTheme();
      },
      /** Áp dụng giao diện hiện tại */
      applyTheme: () => {
        const { mode } = get();
        if (mode === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
    }),
    {
      name: 'smurf_social_theme',
      onRehydrateStorage: () => (state) => {
        state?.applyTheme();
      },
    }
  )
);

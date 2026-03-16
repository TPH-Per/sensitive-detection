import { create } from "zustand";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, doc, Timestamp } from 'firebase/firestore';
import { auth, db } from "../firebase/config";
import { User, BlockOptions, UserSettings, Visibility } from "../../shared/types";
import { userService } from "../services/userService";
import { authService } from "../services/authService";

const DEFAULT_SETTINGS: UserSettings = {
  showOnlineStatus: true,
  showReadReceipts: true,
  defaultPostVisibility: Visibility.PUBLIC,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
};
import { useUserCache } from "./userCacheStore";
import { useRtdbChatStore } from "./rtdbChatStore";
import { usePostStore } from "./postStore";
import { useContactStore } from "./contactStore";
import { useNotificationStore } from "./notificationStore";
import { useCommentStore } from "./commentStore";
import { useReportStore } from "./reportStore";
import { useLoadingStore } from "./loadingStore";
import { usePresenceStore } from "./presenceStore";
import { presenceService } from "../services/presenceService";

interface AuthState {
  user: User | null;
  settings: UserSettings;
  blockedUsers: Record<string, BlockOptions>;
  isPendingVerification: boolean;
  isInitialized: boolean;
  login: (email: string, pass: string, remember?: boolean) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  checkVerificationStatus: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  initialize: () => () => void;
  updateUserProfile: (updates: Partial<User>) => void;
  updateAvatar: (avatar: any) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  updateBlockEntry: (action: "add" | "remove", targetUserId: string, options?: BlockOptions) => void;
}

const clearAllStores = () => {
  usePresenceStore.getState().reset();
  useRtdbChatStore.getState().reset();
  usePostStore.getState().reset();
  useContactStore.getState().reset();
  useNotificationStore.getState().reset();
  useCommentStore.getState().reset();
  useReportStore.getState().reset();
  useLoadingStore.getState().setMultipleLoading(
    ['chat', 'chat.messages', 'chat.send', 'chat.loadMore',
      'feed', 'feed.posts', 'feed.loadMore', 'feed.create', 'feed.update', 'feed.delete',
      'contacts', 'contacts.friends', 'contacts.requests', 'contacts.search',
      'profile', 'profile.data', 'profile.upload', 'profile.update',
      'notifications', 'settings', 'admin.reports', 'admin.users'],
    false
  );
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  settings: DEFAULT_SETTINGS,
  blockedUsers: {},
  isPendingVerification: false,
  isInitialized: false,

  setUser: (user) => set({ user }),

  login: async (email, pass, remember = false) => {
    useLoadingStore.getState().setLoading("auth.login", true);
    try {
      const firebaseUser = await authService.login(email, pass, remember);

      if (!firebaseUser.emailVerified) {
        set({ isPendingVerification: true });
        const err = new Error("Email not verified") as Error & { code?: string };
        err.code = 'auth/email-not-verified';
        throw err;
      }

        const [userData, userSettings] = await Promise.all([
          userService.getUserById(firebaseUser.uid),
          userService.getUserSettings(firebaseUser.uid)
        ]);

        if (userData) {
          if (userData.status === 'banned') {
            await authService.logout();
            const err = new Error("Account banned") as Error & { code?: string };
            err.code = 'auth/user-disabled';
            throw err;
          }

          set({
            user: userData,
            settings: userSettings,
            isPendingVerification: false,
            isInitialized: true,
          });
          useUserCache.getState().setUser(userData);
        } else {
          set({ isPendingVerification: false });
        }
    } catch (error) {
      set({ isPendingVerification: false });
      throw error;
    } finally {
      useLoadingStore.getState().setLoading("auth.login", false);
    }
  },

  register: async (email, pass, name) => {
    useLoadingStore.getState().setLoading("auth.register", true);
    try {
      const firebaseUser = await authService.register(email, pass);
      await userService.createUserDocument(firebaseUser.uid, {
        id: firebaseUser.uid,
        fullName: name,
        avatar: { url: '', fileName: '', mimeType: '', size: 0, isSensitive: false },
        cover: { url: '', fileName: '', mimeType: '', size: 0, isSensitive: false },
        email: email.trim(),
      });

      await authService.sendVerificationEmail();

      set({ isPendingVerification: true });
    } finally {
      useLoadingStore.getState().setLoading("auth.register", false);
    }
  },

  logout: async () => {
    const { user } = get();

    try {
      if (user) {
        await presenceService.setOffline(user.id);
      }
      clearAllStores();
      await authService.logout();
    } catch (error) {
      console.error("Lỗi logout:", error);
    } finally {
      set({ user: null, isPendingVerification: false });
    }
  },

  resetPassword: async (email) => {
    useLoadingStore.getState().setLoading("auth", true);
    try {
      await authService.resetPassword(email);
    } finally {
      useLoadingStore.getState().setLoading("auth", false);
    }
  },

  sendVerificationEmail: async () => {
    try {
      await authService.sendVerificationEmail();
    } catch (error) {
      console.error("Lỗi gửi email xác thực:", error);
      throw error;
    }
  },

  checkVerificationStatus: async () => {
    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
      await firebaseUser.reload();
      if (firebaseUser.emailVerified) {
        set({ isPendingVerification: false });

        try {
          const [userData, blockedUsers, userSettings] = await Promise.all([
            userService.getUserById(firebaseUser.uid),
            userService.getBlockedUsers(firebaseUser.uid),
            userService.getUserSettings(firebaseUser.uid)
          ]);
          if (userData) {
            set({ user: userData, blockedUsers, settings: userSettings });
            useUserCache.getState().setUser(userData);
          }
        } catch (error) {
          console.error("Lỗi đồng bộ sau xác thực:", error);
        }
      }
    }
  },

  updateUserProfile: (updates) => {
    const { user } = get();
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    set({ user: updatedUser });
    useUserCache.getState().setUser(updatedUser);
  },

  updateAvatar: (avatar) => {
    const { user } = get();
    if (!user) return;
    const updatedUser = { ...user, avatar };
    set({ user: updatedUser });
    useUserCache.getState().setUser(updatedUser);
  },

  updateSettings: (settingsUpdates) => {
    const { settings, user } = get();
    if (!settings) return;
    const newSettings = { ...settings, ...settingsUpdates };
    set({ settings: newSettings });

    if (user) {
      const updatedUser = { 
        ...user, 
        settings: {
          ...user.settings,
          ...newSettings,
          updatedAt: Timestamp.now()
        } as UserSettings
      };
      set({ user: updatedUser });
      useUserCache.getState().setUser(updatedUser);
    }
  },

  updateBlockEntry: (action, targetUserId, options?) => {
    const current = get().blockedUsers;
    if (action === "add" && options) {
      set({ blockedUsers: { ...current, [targetUserId]: options } });
    } else if (action === "remove") {
      const updated = { ...current };
      delete updated[targetUserId];
      set({ blockedUsers: updated });
    }
  },

  initialize: () => {
    let userUnsubscribe: (() => void) | null = null;
    let settingsUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = null;
      }
      if (settingsUnsubscribe) {
        settingsUnsubscribe();
        settingsUnsubscribe = null;
      }

      if (firebaseUser) {
        if (!firebaseUser.emailVerified) {
          set({ user: null, isPendingVerification: true, isInitialized: true });
          useLoadingStore.getState().setLoading("auth", false);
          return;
        }

        try {
          const [userData, blockedUsers, userSettings] = await Promise.all([
            userService.getUserById(firebaseUser.uid),
            userService.getBlockedUsers(firebaseUser.uid),
            userService.getUserSettings(firebaseUser.uid)
          ]);

          if (userData) {
            if (userData.status === 'banned') {
              set({ user: userData, isInitialized: true });
              useLoadingStore.getState().setLoading("auth", false);
              get().logout();
              return;
            }


            set({
              user: userData,
              settings: userSettings,
              blockedUsers,
              isPendingVerification: false,
              isInitialized: true,
            });
            useLoadingStore.getState().setLoading("auth", false);
            useUserCache.getState().setUser(userData);
            userUnsubscribe = userService.subscribeToUser(
              firebaseUser.uid,
              async (updatedUser) => {
                if (updatedUser.status === 'banned') {
                  set({ user: updatedUser });
                  get().logout();
                  return;
                }

                const currentBlocked = get().blockedUsers;
                set({ user: updatedUser, blockedUsers: currentBlocked });
                useUserCache.getState().setUser(updatedUser);
              },
            );

            settingsUnsubscribe = onSnapshot(
              doc(db, 'users', firebaseUser.uid, 'private', 'settings'),
              (snapshot) => {
                if (snapshot.exists()) {
                  set({ settings: snapshot.data() as UserSettings });
                } else {
                  set({ settings: DEFAULT_SETTINGS });
                }
              }
            );
          } else {
            set({ user: null, isInitialized: true });
            useLoadingStore.getState().setLoading("auth", false);
          }
        } catch (error) {
          set({ isInitialized: true });
          useLoadingStore.getState().setLoading("auth", false);
        }
      } else {
        clearAllStores();
        set({ user: null, isInitialized: true });
        useLoadingStore.getState().setLoading("auth", false);
      }
    });

    return () => {
      authUnsubscribe();
      if (userUnsubscribe) userUnsubscribe();
      if (settingsUnsubscribe) settingsUnsubscribe();
    };
  },
}));

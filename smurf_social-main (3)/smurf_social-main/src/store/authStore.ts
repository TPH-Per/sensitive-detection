import { create } from "zustand";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, doc, Timestamp } from 'firebase/firestore';
import { auth, db } from "../firebase/config";
import { User, BlockOptions, UserSettings, Visibility, Generation, MediaObject } from "../../shared/types";
import { userService } from "../services/userService";
import { authService } from "../services/authService";
import { friendService } from "../services/friendService";
import { isFullyBlocked } from "../utils/blockUtils";
import { collection } from 'firebase/firestore';

const DEFAULT_SETTINGS: UserSettings = {
  showOnlineStatus: true,
  showReadReceipts: true,
  allowMessagesFromStrangers: true,
  defaultPostVisibility: Visibility.FRIENDS,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
};
import { presenceService } from "../services/presenceService";
import { resetAllStores } from "./storeUtils";
import { useUserCache } from "./userCacheStore";
import { useLoadingStore } from "./loadingStore";
import { usePostStore } from "./posts";
import { useRtdbChatStore } from "./rtdbChatStore";
import { getDirectConversationId } from "../utils/chatUtils";

interface AuthState {
  user: User | null;
  settings: UserSettings;
  blockedUsers: Record<string, BlockOptions>;
  isPendingVerification: boolean;
  isInitialized: boolean;
  isBanned: boolean;
  login: (email: string, pass: string, remember?: boolean) => Promise<void>;
  register: (email: string, pass: string, name: string, dob: number, generation: Generation) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  checkVerificationStatus: () => Promise<void>;
  logout: (keepBanned?: boolean) => Promise<void>;
  setUser: (user: User | null) => void;
  initialize: () => () => void;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  updateAvatar: (avatar: MediaObject) => void;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  updateBlockEntry: (action: "add" | "remove", targetUserId: string, options?: BlockOptions) => Promise<void>;
  completeOnboarding: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  settings: DEFAULT_SETTINGS,
  blockedUsers: {},
  isPendingVerification: false,
  isInitialized: false,
  isBanned: false,

  /** Cập nhật thông tin người dùng */
  setUser: (user) => set({ user }),

  /** Đăng nhập vào hệ thống */
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

  /** Đăng ký tài khoản mới */
  register: async (email, pass, name, dob, generation) => {
    useLoadingStore.getState().setLoading("auth.register", true);
    try {
      const firebaseUser = await authService.register(email, pass);
      await userService.createUserDocument(firebaseUser.uid, {
        fullName: name,
        email: email.trim(),
        dob: Timestamp.fromDate(new Date(dob)),
        generation: generation,
      });

      await authService.sendVerificationEmail();

      set({ isPendingVerification: true });
    } finally {
      useLoadingStore.getState().setLoading("auth.register", false);
    }
  },

  /** Đăng xuất khỏi hệ thống */
  logout: async (keepBanned = false) => {
    const { user } = get();

    try {
      if (user) {
        await presenceService.setOffline(user.id);
      }
      resetAllStores();
      useLoadingStore.getState().setLoading("auth", false);
      await authService.logout();
    } catch (error) {
      console.error("Lỗi logout:", error);
    } finally {
      set({
        user: null,
        isPendingVerification: false,
        isBanned: keepBanned ? get().isBanned : false
      });
    }
  },

  /** Đặt lại mật khẩu qua email */
  resetPassword: async (email) => {
    useLoadingStore.getState().setLoading("auth", true);
    try {
      await authService.resetPassword(email);
    } finally {
      useLoadingStore.getState().setLoading("auth", false);
    }
  },

  /** Gửi lại email xác thực */
  sendVerificationEmail: async () => {
    try {
      await authService.sendVerificationEmail();
    } catch (error) {
      console.error("Lỗi gửi email xác thực:", error);
      throw error;
    }
  },

  /** Kiểm tra trạng thái xác thực email */
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
            if (userData.status === 'banned') {
              set({ user: userData, isBanned: true, isInitialized: true });
              await get().logout(true);
              return;
            }

            set({
              user: userData,
              blockedUsers,
              settings: userSettings,
              isInitialized: true
            });
            useUserCache.getState().setUser(userData);

            const setupSub = (get() as any)._setupUserSubscription;
            if (setupSub) setupSub(firebaseUser.uid);
          }
        } catch (error) {
          console.error("Lỗi đồng bộ sau xác thực:", error);
        }
      }
    }
  },

  /** Cập nhật hồ sơ cá nhân */
  updateUserProfile: async (updates) => {
    const { user } = get();
    if (!user) return;
    const previousUser = { ...user };
    const updatedUser = { ...user, ...updates };
    
    set({ user: updatedUser });
    useUserCache.getState().setUser(updatedUser);

    try {
      await userService.updateProfile(user.id, updates);
    } catch (error) {
      console.error("Lỗi cập nhật profile:", error);
      set({ user: previousUser });
      useUserCache.getState().setUser(previousUser);
      throw error;
    }
  },

  /** Cập nhật ảnh đại diện */
  updateAvatar: (avatar) => {
    const { user } = get();
    if (!user) return;
    const updatedUser = { ...user, avatar };
    set({ user: updatedUser });
    useUserCache.getState().setUser(updatedUser);
  },

  /** Cập nhật cấu hình người dùng */
  updateSettings: async (settingsUpdates) => {
    const { user, settings } = get();
    if (!user || !settings) return;
    const previousSettings = { ...settings };
    
    set({ settings: { ...settings, ...settingsUpdates } });

    try {
      await userService.updateUserSettings(user.id, settingsUpdates);
    } catch (error) {
      console.error("Lỗi cập nhật cài đặt:", error);
      set({ settings: previousSettings });
      throw error;
    }
  },

  /** Thêm hoặc xóa chặn người dùng */
  updateBlockEntry: async (action, targetUserId, options?) => {
    const { user, blockedUsers } = get();
    if (!user) return;
    const previousBlocked = { ...blockedUsers };

    if (action === "add" && options) {
      set({ blockedUsers: { ...blockedUsers, [targetUserId]: options } });
      
      if (options.hideTheirActivity || options.blockViewMyActivity) {
        usePostStore.getState().filterPostsByAuthor(targetUserId);
      }
      
      if (options.blockMessages) {
        const directConvId = getDirectConversationId(user.id, targetUserId);
        const chatStore = useRtdbChatStore.getState();
        if (chatStore.selectedConversationId === directConvId) {
          chatStore.selectConversation(null);
        }
      }

      try {
        await userService.blockUser(user.id, targetUserId, options);
        
        if (isFullyBlocked(options)) {
          await friendService.unfriend(user.id, targetUserId);
        }
      } catch (error) {
        set({ blockedUsers: previousBlocked });
        throw error;
      }
    } else if (action === "remove") {
      const updated = { ...blockedUsers };
      delete updated[targetUserId];
      set({ blockedUsers: updated });
      try {
        await userService.unblockUser(user.id, targetUserId);
      } catch (error) {
        set({ blockedUsers: previousBlocked });
        throw error;
      }
    }
  },

  /** Hoàn tất thông tin ban đầu */
  completeOnboarding: async (data) => {
    const { user } = get();
    if (!user) return;
    const previousUser = { ...user };
    const updatedUser = { ...user, ...data };

    set({ user: updatedUser });
    useUserCache.getState().setUser(updatedUser);

    try {
      if (Object.keys(data).length > 0) {
        await userService.updateProfile(user.id, data);
      }
      friendService.generateFriendSuggestions(20).catch(() => {});
    } catch (error) {
      console.error("Lỗi hoàn tất onboarding:", error);
      set({ user: previousUser });
      useUserCache.getState().setUser(previousUser);
      throw error;
    }
  },

  /** Khởi tạo trạng thái và lắng nghe thay đổi */
  initialize: () => {
    let userUnsubscribe: (() => void) | null = null;
    let settingsUnsubscribe: (() => void) | null = null;
    let blockUnsubscribe: (() => void) | null = null;

    const setupSubscriptions = (uid: string) => {
      if (userUnsubscribe) userUnsubscribe();
      if (settingsUnsubscribe) settingsUnsubscribe();
      if (blockUnsubscribe) blockUnsubscribe();

      userUnsubscribe = userService.subscribeToUser(
        uid,
        async (updatedUser) => {
          if (updatedUser.status === 'banned') {
            if (userUnsubscribe) { userUnsubscribe(); userUnsubscribe = null; }
            if (settingsUnsubscribe) { settingsUnsubscribe(); settingsUnsubscribe = null; }

            set({ user: updatedUser, isBanned: true });
            await get().logout(true);
            return;
          }

          const currentBlocked = get().blockedUsers;
          set({ user: updatedUser, blockedUsers: currentBlocked });
          useUserCache.getState().setUser(updatedUser);
        },
      );

      settingsUnsubscribe = onSnapshot(
        doc(db, 'users', uid, 'private', 'settings'),
        (snapshot) => {
          if (snapshot.exists()) {
            set({ settings: snapshot.data() as UserSettings });
          } else {
            set({ settings: DEFAULT_SETTINGS });
          }
        }
      );

      blockUnsubscribe = onSnapshot(
        collection(db, 'users', uid, 'blockedUsers'),
        (snapshot) => {
          const blockedUsers: Record<string, BlockOptions> = {};
          snapshot.forEach(doc => {
            blockedUsers[doc.id] = doc.data() as BlockOptions;
          });
          set({ blockedUsers });
        }
      );
    };

    (set as any)({ _setupUserSubscription: setupSubscriptions });

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (userUnsubscribe) { userUnsubscribe(); userUnsubscribe = null; }
      if (settingsUnsubscribe) { settingsUnsubscribe(); settingsUnsubscribe = null; }
      if (blockUnsubscribe) { blockUnsubscribe(); blockUnsubscribe = null; }

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
              set({ user: userData, isInitialized: true, isBanned: true });
              await get().logout(true);
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

            setupSubscriptions(firebaseUser.uid);
          } else {
            set({ user: null, isInitialized: true });
            useLoadingStore.getState().setLoading("auth", false);
          }
        } catch (error) {
          set({ isInitialized: true });
          useLoadingStore.getState().setLoading("auth", false);
        }
      } else {
        if (get().isBanned) {
          set({ isInitialized: true });
          useLoadingStore.getState().setLoading("auth", false);
          return;
        }
        resetAllStores();
        set({ user: null, isInitialized: true });
        useLoadingStore.getState().setLoading("auth", false);
      }
    });

    return () => {
      authUnsubscribe();
      if (userUnsubscribe) userUnsubscribe();
      if (settingsUnsubscribe) settingsUnsubscribe();
      if (blockUnsubscribe) blockUnsubscribe();
    };
  },
}));

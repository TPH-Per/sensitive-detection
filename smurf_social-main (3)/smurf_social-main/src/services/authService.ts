import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { auth } from '../firebase/config';

export const authService = {
  /** Đăng nhập hệ thống */
  login: async (email: string, pass: string, remember: boolean = false): Promise<FirebaseUser> => {
    const persistence = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return user;
  },

  /** Đăng ký tài khoản mới */
  register: async (email: string, pass: string): Promise<FirebaseUser> => {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    return user;
  },

  /** Đặt lại mật khẩu qua email */
  resetPassword: async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email.trim());
  },

  /** Gửi email xác thực tài khoản */
  sendVerificationEmail: async (): Promise<void> => {
    const user = auth.currentUser;
    if (user) {
      await sendEmailVerification(user);
    }
  },

  /** Đăng xuất hệ thống */
  logout: async (): Promise<void> => {
    await signOut(auth);
  },

  /** Xác thực lại mật khẩu */
  reauthenticate: async (password: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("Chưa đăng nhập");
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  },

  /** Thay đổi mật khẩu người dùng */
  changePassword: async (newPassword: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error("Chưa đăng nhập");
    await updatePassword(user, newPassword);
  }
};

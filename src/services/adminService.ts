import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserRole } from '../types';

export const adminService = {
    // Cập nhật vai trò người dùng
    setUserRole: async (userId: string, role: UserRole): Promise<void> => {
        try {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
                role,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Lỗi cập nhật role", error);
            throw error;
        }
    },

    // Chặn người dùng
    banUser: async (userId: string): Promise<void> => {
        try {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
                status: 'banned',
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Lỗi ban user", error);
            throw error;
        }
    },

    // Bỏ chặn người dùng
    unbanUser: async (userId: string): Promise<void> => {
        try {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
                status: 'active',
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Lỗi unban user", error);
            throw error;
        }
    }
};

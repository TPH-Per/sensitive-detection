export const systemMessages = {
    CREATE_GROUP: (actorName: string) => `${actorName} đã tạo nhóm`,
    ADD_MEMBERS: (actorName: string, memberNames: string) => `${actorName} đã thêm ${memberNames} vào nhóm`,
    REMOVE_MEMBER: (actorName: string, targetName: string) => `${actorName} đã xóa ${targetName} khỏi nhóm`,
    LEAVE_GROUP: (actorName: string) => `${actorName} đã rời nhóm`,
    DISBAND_GROUP: () => `Nhóm đã giải tán`,
    CHANGE_ADMIN_ROLE: (actorName: string, targetName: string) => `${actorName} đã chuyển quyền quản trị cho ${targetName}`,
    PROMOTE_TO_ADMIN: (actorName: string, targetName: string) => `${actorName} đã thăng ${targetName} làm quản trị viên`,
    DEMOTE_FROM_ADMIN: (actorName: string, targetName: string) => `${actorName} đã hạ quyền quản trị viên của ${targetName}`,
    UPDATE_GROUP_NAME: (actorName: string, newName: string) => `${actorName} đã đổi tên nhóm thành "${newName}"`,
    UPDATE_GROUP_AVATAR: (actorName: string) => `${actorName} đã cập nhật ảnh nhóm`,
    UPDATE_GROUP_BOTH: (actorName: string, newName: string) => `${actorName} đã cập nhật ảnh nhóm và đổi tên nhóm thành "${newName}"`,
};

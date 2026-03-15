import { FILE_LIMITS, VALIDATION } from '../constants';

export class FileValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FileValidationError';
    }
}

export function validateImageFile(file: File): void {
    if (!file.type.startsWith('image/')) {
        throw new FileValidationError('File phải là ảnh (JPG, PNG, GIF, WebP)');
    }
    if (file.size > FILE_LIMITS.IMAGE) {
        const maxSizeMB = FILE_LIMITS.IMAGE / (1024 * 1024);
        throw new FileValidationError(`Ảnh không được vượt quá ${maxSizeMB}MB`);
    }
}

export function validateVideoFile(file: File): void {
    if (!file.type.startsWith('video/')) {
        throw new FileValidationError('File phải là video (MP4, WebM, MOV)');
    }
    if (file.size > FILE_LIMITS.VIDEO) {
        const maxSizeMB = FILE_LIMITS.VIDEO / (1024 * 1024);
        throw new FileValidationError(`Video không được vượt quá ${maxSizeMB}MB`);
    }
}

export function validateChatFile(file: File): void {
    if (file.size > FILE_LIMITS.FILE) {
        const maxSizeMB = FILE_LIMITS.FILE / (1024 * 1024);
        throw new FileValidationError(`File không được vượt quá ${maxSizeMB}MB`);
    }
}

export function validateVoiceFile(file: File): void {
    if (!file.type.startsWith('audio/')) {
        throw new FileValidationError('File phải là audio');
    }
    if (file.size > FILE_LIMITS.FILE) {
        const maxSizeMB = FILE_LIMITS.FILE / (1024 * 1024);
        throw new FileValidationError(`File audio không được vượt quá ${maxSizeMB}MB`);
    }
}

export function validateAvatarFile(file: File): void {
    if (!file.type.startsWith('image/')) {
        throw new FileValidationError('Ảnh đại diện phải là file ảnh');
    }
    if (file.size > FILE_LIMITS.AVATAR) {
        const maxSizeMB = FILE_LIMITS.AVATAR / (1024 * 1024);
        throw new FileValidationError(`Ảnh đại diện không được vượt quá ${maxSizeMB}MB`);
    }
}

export function validateCoverFile(file: File): void {
    if (!file.type.startsWith('image/')) {
        throw new FileValidationError('Ảnh bìa phải là file ảnh');
    }
    if (file.size > FILE_LIMITS.COVER) {
        const maxSizeMB = FILE_LIMITS.COVER / (1024 * 1024);
        throw new FileValidationError(`Ảnh bìa không được vượt quá ${maxSizeMB}MB`);
    }
}

export function validatePostContent(content: string): void {
    if (content.length > VALIDATION.POST_CONTENT_MAX_LENGTH) {
        throw new FileValidationError(
            `Nội dung bài viết không được vượt quá ${VALIDATION.POST_CONTENT_MAX_LENGTH} ký tự`
        );
    }
}

export function validateCommentContent(content: string): void {
    if (content.length > VALIDATION.COMMENT_MAX_LENGTH) {
        throw new FileValidationError(
            `Bình luận không được vượt quá ${VALIDATION.COMMENT_MAX_LENGTH} ký tự`
        );
    }
}

export function validateMessageContent(content: string): void {
    if (content.length > VALIDATION.MESSAGE_MAX_LENGTH) {
        throw new FileValidationError(
            `Tin nhắn không được vượt quá ${VALIDATION.MESSAGE_MAX_LENGTH} ký tự`
        );
    }
}

export function validateBio(bio: string): void {
    if (bio.length > VALIDATION.BIO_MAX_LENGTH) {
        throw new FileValidationError(
            `Tiểu sử không được vượt quá ${VALIDATION.BIO_MAX_LENGTH} ký tự`
        );
    }
}

export function validateUserName(name: string): void {
    if (!name || name.trim().length === 0) {
        throw new FileValidationError('Tên không được để trống');
    }
    if (name.length > VALIDATION.USER_NAME_MAX_LENGTH) {
        throw new FileValidationError(
            `Tên không được vượt quá ${VALIDATION.USER_NAME_MAX_LENGTH} ký tự`
        );
    }
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

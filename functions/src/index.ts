import { setGlobalOptions } from 'firebase-functions/v2';

// Cấu hình tối ưu để tiết kiệm Quota CPU/Memory
setGlobalOptions({ 
    region: 'us-central1',
    memory: '512MiB',
    cpu: 0.5,
    concurrency: 1
});



// Notification Triggers
export { onPostReactionWrite } from './notifications/onPostReactionWrite';
export { onCommentReactionWrite } from './notifications/onCommentReactionWrite';
export { onCommentWrite } from './notifications/onCommentWrite';
export { onFriendRequestWrite } from './notifications/onFriendRequestWrite';
export { onReportCreated } from './notifications/onReportCreated';

export { onPostWrite } from './posts/onPostWrite';
export { onFriendWrite } from './posts/onFriendWrite';
export { onBlockedUserWrite } from './posts/onBlockedUserWrite';

export { resolveReport } from './admin/resolveReport';
export { rejectReport } from './admin/rejectReport';
export { banUser } from './admin/banUser';
export { searchUsers } from './search/searchUsers';
export { systemCleanup } from './scheduled/cleanup';
export { generateZegoToken } from './call/generateZegoToken';

export { onMessageCreated } from './notifications/onMessageCreated';



import { setGlobalOptions } from 'firebase-functions/v2';


setGlobalOptions({
    region: 'asia-southeast1',
    memory: '512MiB',
    cpu: 0.5,
    concurrency: 1,
    invoker: 'public'
});




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
export { generateFriendSuggestions } from './friends/generateFriendSuggestions';
export { onUserProfileUpdated } from './friends/onUserProfileUpdated';
export { onMessageCreated } from './notifications/onMessageCreated';
export { startDirectConversation } from './chat/startDirectConversation';
export { 
    createGroup, 
    addGroupMembers, 
    leaveGroup, 
    removeGroupMember, 
    disbandGroup, 
    updateGroupInfo, 
    updateMemberRole, 
    transferCreator, 
    toggleApprovalMode, 
    inviteMember, 
    approveMembers, 
    rejectMembers,
    getGroupInviteLink,
    regenerateGroupInviteLink,
    joinGroupByLink,
    getGroupInviteInfo
} from './chat/groupActions';


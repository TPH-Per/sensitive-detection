import { messageSendService } from './messages/messageSendService';
import { messageStatusService } from './messages/messageStatusService';
import { messageActionService } from './messages/messageActionService';
import { messageReactionService } from './messages/messageReactionService';
import { messageQueryService } from './messages/messageQueryService';

export const rtdbMessageService = {
    ...messageSendService,
    ...messageStatusService,
    ...messageActionService,
    ...messageReactionService,
    ...messageQueryService
};

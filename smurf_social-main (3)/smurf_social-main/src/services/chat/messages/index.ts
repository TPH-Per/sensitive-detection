import { messageSendService } from './messageSendService';
import { messageStatusService } from './messageStatusService';
import { messageActionService } from './messageActionService';
import { messageReactionService } from './messageReactionService';
import { messageQueryService } from './messageQueryService';

export { messageSendService } from './messageSendService';
export { messageStatusService } from './messageStatusService';
export { messageActionService } from './messageActionService';
export { messageReactionService } from './messageReactionService';
export { messageQueryService } from './messageQueryService';
export type { ProgressWithId } from './messageHelpers';

export const rtdbMessageService = {
    ...messageSendService,
    ...messageStatusService,
    ...messageActionService,
    ...messageReactionService,
    ...messageQueryService
};

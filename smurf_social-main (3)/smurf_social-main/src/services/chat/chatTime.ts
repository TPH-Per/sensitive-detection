import { onValue, ref, serverTimestamp } from 'firebase/database';
import { rtdb } from '../../firebase/config';

let serverOffsetMs = 0;
let isInitialized = false;

const initServerOffset = (): void => {
    if (isInitialized) return;
    isInitialized = true;

    onValue(ref(rtdb, '.info/serverTimeOffset'), (snapshot) => {
        const value = snapshot.val();
        serverOffsetMs = typeof value === 'number' ? value : 0;
    });
};

export const getServerSyncedNow = (): number => {
    initServerOffset();
    return Date.now() + serverOffsetMs;
};

export const getRtdbServerTimestamp = (): ReturnType<typeof serverTimestamp> => serverTimestamp();

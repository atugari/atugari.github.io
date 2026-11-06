package jp.nanpure.refill;

import java.io.IOException;
import java.util.concurrent.locks.ReentrantLock;
import org.json.JSONException;

/**
 * Test seam for the Android runner's registration lock.
 * The Android worker/service execution path is reviewed separately.
 */
final class RefillRunner {
    private static final ReentrantLock EXCLUSIVE = new ReentrantLock();
    @FunctionalInterface interface RegistrationAction<T> {
        T run() throws IOException, JSONException;
    }
    static <T> T withRegistrationLock(RegistrationAction<T> action)
            throws IOException, JSONException, InterruptedException {
        EXCLUSIVE.lockInterruptibly();
        try { return action.run(); }
        finally { EXCLUSIVE.unlock(); }
    }
    static boolean registrationLockHeldForTest() { return EXCLUSIVE.isHeldByCurrentThread(); }
}

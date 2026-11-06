package jp.nanpure.refill;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.IdentityHashMap;

final class RefillStore {
    private static final Object REGISTRATION = new Object();
    // A failed commit can still change SharedPreferences' memory. Keep the last attempt
    // fenced until a later commit proves that it is durable, even across Store instances.
    private static final IdentityHashMap<SharedPreferences, EnrollmentAttempt> UNCERTAIN = new IdentityHashMap<>();
    private final SharedPreferences values;

    static final class EnrollmentAttempt {
        final String token;
        final String endpoint;
        final String previousToken;
        final boolean fresh;
        final long generation;

        private EnrollmentAttempt(String token, String endpoint, String previousToken, boolean fresh, long generation) {
            this.token = token;
            this.endpoint = endpoint;
            this.previousToken = previousToken;
            this.fresh = fresh;
            this.generation = generation;
        }
    }

    RefillStore(Context context) {
        values = context.getSharedPreferences("refill", Context.MODE_PRIVATE);
    }

    String token() { return values.getString("token", ""); }
    String endpoint() { return values.getString("endpoint", BuildConfig.ENDPOINT); }
    boolean enabled() { return values.getBoolean("enabled", false); }
    boolean meteredAllowed() { return values.getBoolean("metered", false); }
    boolean maximumPerformance() { return values.getBoolean("maximumPerformance", false); }
    boolean notificationsAsked() { return values.getBoolean("notificationsAsked", false); }
    int sent() { return values.getInt("sent", 0); }
    long updated() { return values.getLong("updated", 0); }
    String status() { return values.getString("status", "未登録"); }
    int vaultTarget() { return values.getInt("vaultTarget", 0); }
    int vaultCursor() { return values.getInt("vaultCursor", 0); }
    long vaultCount() { return values.getLong("vaultCount", -1); }
    long vaultBytes() { return values.getLong("vaultBytes", 0); }
    int vaultProfiles() { return values.getInt("vaultProfiles", 0); }
    boolean bootstrapConsumed() { return values.getBoolean("bootstrapConsumed", false); }

    boolean registrationPending() {
        synchronized (REGISTRATION) { return registrationPendingLocked(); }
    }

    boolean registrationReady() {
        synchronized (REGISTRATION) { return !registrationPendingLocked() && !token().isEmpty(); }
    }

    private boolean registrationPendingLocked() {
        return UNCERTAIN.containsKey(values) || values.getBoolean("enrollmentPending", false);
    }

    EnrollmentAttempt pendingEnrollment() {
        synchronized (REGISTRATION) { return pendingEnrollmentLocked(); }
    }

    private EnrollmentAttempt pendingEnrollmentLocked() {
        EnrollmentAttempt uncertain = UNCERTAIN.get(values);
        if (uncertain != null) return uncertain;
        if (!values.getBoolean("enrollmentPending", false)) return null;
        return new EnrollmentAttempt(values.getString("enrollmentToken", ""),
                values.getString("enrollmentEndpoint", ""), values.getString("enrollmentPreviousToken", ""),
                values.getBoolean("enrollmentFresh", false), values.getLong("registrationGeneration", 0));
    }

    EnrollmentAttempt prepareEnrollment(String service, String legacyTokenSha256) throws IOException {
        synchronized (REGISTRATION) {
            if (!BuildConfig.ENDPOINT.equals(service) || !legacyTokenSha256.matches("[a-f0-9]{64}")) {
                throw new IOException("Invalid automatic registration configuration");
            }
            EnrollmentAttempt pending = pendingEnrollmentLocked();
            if (pending != null) {
                validateAttempt(pending, service);
                persistEnrollment(pending);
                return pending;
            }
            String previous = token();
            boolean fresh = previous.isEmpty();
            if (fresh ? bootstrapConsumed() :
                    !endpoint().equals(service) || !digest(previous).equals(legacyTokenSha256)) return null;
            EnrollmentAttempt attempt = new EnrollmentAttempt(randomToken(), service, previous, fresh,
                    values.getLong("registrationGeneration", 0) + 1);
            SharedPreferences.Editor edit = pendingEdit(attempt);
            if (fresh) edit.putBoolean("enabled", false).putBoolean("maximumPerformance", true).putInt("vaultTarget", 10);
            edit.putString("status", "このスマホを自動登録しています・接続待ち")
                    .putLong("updated", System.currentTimeMillis());
            UNCERTAIN.put(values, attempt);
            write(edit);
            UNCERTAIN.remove(values);
            return attempt;
        }
    }

    boolean isCurrentEnrollment(EnrollmentAttempt attempt) {
        synchronized (REGISTRATION) { return isCurrentEnrollmentLocked(attempt); }
    }

    private boolean isCurrentEnrollmentLocked(EnrollmentAttempt attempt) {
        EnrollmentAttempt current = pendingEnrollmentLocked();
        return attempt != null && current != null && attempt.generation == current.generation &&
                attempt.token.equals(current.token) && attempt.endpoint.equals(current.endpoint) &&
                attempt.previousToken.equals(current.previousToken) && attempt.fresh == current.fresh;
    }

    boolean persistEnrollment(EnrollmentAttempt attempt) throws IOException {
        synchronized (REGISTRATION) {
            if (!isCurrentEnrollmentLocked(attempt)) return false;
            validateAttempt(attempt, BuildConfig.ENDPOINT);
            UNCERTAIN.put(values, attempt);
            // Always commit again immediately before HTTP. In-memory preferences alone
            // cannot prove that an earlier failed commit saved this token to disk.
            write(pendingEdit(attempt));
            UNCERTAIN.remove(values);
            return true;
        }
    }

    boolean completeEnrollment(EnrollmentAttempt attempt, String deviceId) throws IOException {
        synchronized (REGISTRATION) {
            if (!isCurrentEnrollmentLocked(attempt)) return false;
            if (deviceId == null || deviceId.isEmpty() || deviceId.length() > 128) {
                throw new IOException("Invalid automatic registration response");
            }
            if (!values.getString("pending", "").isEmpty()) {
                throw new IOException("A local delivery still requires migration");
            }
            UNCERTAIN.put(values, attempt);
            try {
                write(clearEnrollment(values.edit()).putString("token", attempt.token).putString("endpoint", attempt.endpoint)
                        .putString("registrationDeviceId", deviceId).putBoolean("bootstrapConsumed", true)
                        .remove("pairCode").remove("pairEndpoint").remove("pairToken")
                        .putString("status", "このスマホを登録しました・補充を始められます")
                        .putLong("updated", System.currentTimeMillis()));
            } catch (IOException failure) {
                // Later preference edits must not flush the failed final state from
                // memory. Restore the same pending attempt; readiness remains fenced.
                pendingEdit(attempt).apply();
                throw failure;
            }
            UNCERTAIN.remove(values);
            return true;
        }
    }

    void enrollmentStatus(EnrollmentAttempt attempt, String message) {
        synchronized (REGISTRATION) {
            if (isCurrentEnrollmentLocked(attempt)) writeStatus(message);
        }
    }

    private SharedPreferences.Editor pendingEdit(EnrollmentAttempt attempt) {
        return values.edit().putBoolean("enrollmentPending", true).putString("enrollmentToken", attempt.token)
                .putString("enrollmentEndpoint", attempt.endpoint).putString("enrollmentPreviousToken", attempt.previousToken)
                .putBoolean("enrollmentFresh", attempt.fresh).putLong("registrationGeneration", attempt.generation)
                .putBoolean("bootstrapConsumed", true).putString("token", attempt.previousToken)
                .putString("endpoint", attempt.endpoint);
    }

    private static SharedPreferences.Editor clearEnrollment(SharedPreferences.Editor edit) {
        return edit.remove("enrollmentPending").remove("enrollmentToken").remove("enrollmentEndpoint")
                .remove("enrollmentPreviousToken").remove("enrollmentFresh");
    }

    private static void validateAttempt(EnrollmentAttempt attempt, String endpoint) throws IOException {
        if (!attempt.token.matches("[a-f0-9]{64}") || !attempt.endpoint.equals(endpoint) || attempt.generation <= 0 ||
                (!attempt.previousToken.isEmpty() && !attempt.previousToken.matches("[a-f0-9]{64}"))) {
            throw new IOException("Invalid saved automatic registration");
        }
    }

    boolean applyBootstrap(String deviceToken, String service) throws IOException {
        synchronized (REGISTRATION) {
            if (bootstrapConsumed() || !token().isEmpty()) return false;
            if (!deviceToken.matches("[a-f0-9]{64}") || !BuildConfig.ENDPOINT.equals(service)) {
                throw new IOException("Invalid preset registration");
            }
            write(values.edit().putString("token", deviceToken).putString("endpoint", service)
                    .putBoolean("bootstrapConsumed", true).putBoolean("enabled", false)
                    .putBoolean("maximumPerformance", true).putInt("vaultTarget", 10)
                    .putString("status", "登録済み・補充を始められます")
                    .putLong("updated", System.currentTimeMillis()));
            return true;
        }
    }

    void enabled(boolean enabled) { values.edit().putBoolean("enabled", enabled).apply(); }
    void meteredAllowed(boolean allowed) { values.edit().putBoolean("metered", allowed).apply(); }
    void maximumPerformance(boolean enabled) { values.edit().putBoolean("maximumPerformance", enabled).apply(); }
    void markNotificationsAsked() { values.edit().putBoolean("notificationsAsked", true).apply(); }
    void vaultTarget(int target) { values.edit().putInt("vaultTarget", target).apply(); }

    void vaultCursor(String token, int cursor) {
        synchronized (REGISTRATION) {
            if (token.equals(token())) values.edit().putInt("vaultCursor", cursor).apply();
        }
    }

    void vaultSummary(String token, long count, long bytes, int profiles, long sent) {
        synchronized (REGISTRATION) {
            if (!token.equals(token())) return;
            int sentCount = (int) Math.min(Integer.MAX_VALUE, sent);
            if (count != vaultCount() || bytes != vaultBytes() || profiles != vaultProfiles() || sentCount != sent()) {
                values.edit().putLong("vaultCount", count).putLong("vaultBytes", bytes)
                        .putInt("vaultProfiles", profiles).putInt("sent", sentCount).apply();
            }
        }
    }

    void status(String status) {
        synchronized (REGISTRATION) {
            if (!registrationPendingLocked()) writeStatus(status);
        }
    }

    void status(String activeToken, String activeEndpoint, String message) {
        synchronized (REGISTRATION) {
            if (!registrationPendingLocked() && !activeToken.isEmpty() && activeToken.equals(token()) &&
                    activeEndpoint.equals(endpoint())) writeStatus(message);
        }
    }

    boolean registrationRejected(String activeToken, String activeEndpoint) {
        synchronized (REGISTRATION) {
            if (registrationPendingLocked() || activeToken.isEmpty() || !activeToken.equals(token()) ||
                    !activeEndpoint.equals(endpoint())) return false;
            values.edit().putBoolean("enabled", false).putString("status", "端末登録を確認してください")
                    .putLong("updated", System.currentTimeMillis()).apply();
            return true;
        }
    }

    private void writeStatus(String status) {
        if (!status.equals(status())) values.edit().putString("status", status)
                .putLong("updated", System.currentTimeMillis()).apply();
    }

    String pairingToken(String code, String endpoint) throws IOException {
        synchronized (REGISTRATION) {
            if (registrationPendingLocked()) throw new IOException("Automatic registration is pending");
            String previous = values.getString("pairCode", "");
            String token = values.getString("pairToken", "");
            if (!code.equals(previous) || !endpoint.equals(values.getString("pairEndpoint", "")) ||
                    !token.matches("[a-f0-9]{64}")) token = randomToken();
            write(values.edit().putString("pairCode", code).putString("pairEndpoint", endpoint).putString("pairToken", token));
            return token;
        }
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder key = new StringBuilder(64);
        for (byte digit : bytes) {
            key.append(Character.forDigit((digit & 0xff) >>> 4, 16));
            key.append(Character.forDigit(digit & 0xf, 16));
        }
        return key.toString();
    }

    private static String digest(String value) throws IOException {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte digit : bytes) {
                result.append(Character.forDigit((digit & 0xff) >>> 4, 16));
                result.append(Character.forDigit(digit & 0xf, 16));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("SHA-256 is unavailable", error);
        }
    }

    void paired(String token, String endpoint) throws IOException {
        synchronized (REGISTRATION) {
            long generation = values.getLong("registrationGeneration", 0) + 1;
            UNCERTAIN.remove(values);
            write(clearEnrollment(values.edit()).putString("token", token).putString("endpoint", endpoint).putBoolean("enabled", true)
                    .putBoolean("bootstrapConsumed", true).putLong("registrationGeneration", generation)
                    .remove("pairCode").remove("pairEndpoint").remove("pairToken"));
            status("登録済み・補充の条件待ち");
        }
    }

    void unpair() throws IOException {
        synchronized (REGISTRATION) {
            long generation = values.getLong("registrationGeneration", 0) + 1;
            UNCERTAIN.remove(values);
            write(values.edit().clear().putBoolean("bootstrapConsumed", true).putLong("registrationGeneration", generation));
        }
    }

    JSONObject pending() throws JSONException {
        String encoded = values.getString("pending", "");
        return encoded.isEmpty() ? null : new JSONObject(encoded);
    }

    boolean pending(String token, JSONObject payload) throws IOException {
        synchronized (REGISTRATION) {
            if (!token.equals(token())) return false;
            write(values.edit().putString("pending", payload.toString()));
            return true;
        }
    }

    boolean clearPending(String token, boolean accepted) throws IOException {
        synchronized (REGISTRATION) {
            if (!token.equals(token())) return false;
            SharedPreferences.Editor edit = values.edit().remove("pending");
            if (accepted) edit.putInt("sent", sent() + 1);
            write(edit);
            return true;
        }
    }

    private static void write(SharedPreferences.Editor edit) throws IOException {
        if (!edit.commit()) throw new IOException("Refill state could not be saved");
    }
}

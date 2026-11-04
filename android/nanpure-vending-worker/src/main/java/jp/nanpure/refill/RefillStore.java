package jp.nanpure.refill;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.security.SecureRandom;

final class RefillStore {
    private static final Object REGISTRATION = new Object();
    private final SharedPreferences values;

    RefillStore(Context context) {
        values = context.getSharedPreferences("refill", Context.MODE_PRIVATE);
    }

    String token() { return values.getString("token", ""); }
    String endpoint() { return values.getString("endpoint", BuildConfig.ENDPOINT); }
    boolean enabled() { return values.getBoolean("enabled", false); }
    boolean meteredAllowed() { return values.getBoolean("metered", false); }
    boolean notificationsAsked() { return values.getBoolean("notificationsAsked", false); }
    int sent() { return values.getInt("sent", 0); }
    long updated() { return values.getLong("updated", 0); }
    String status() { return values.getString("status", "未登録"); }
    int vaultTarget() { return values.getInt("vaultTarget", 0); }
    int vaultCursor() { return values.getInt("vaultCursor", 0); }
    long vaultCount() { return values.getLong("vaultCount", -1); }
    long vaultBytes() { return values.getLong("vaultBytes", 0); }
    int vaultProfiles() { return values.getInt("vaultProfiles", 0); }

    void enabled(boolean enabled) { values.edit().putBoolean("enabled", enabled).apply(); }
    void meteredAllowed(boolean allowed) { values.edit().putBoolean("metered", allowed).apply(); }
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
        if (!status.equals(status())) {
            values.edit().putString("status", status).putLong("updated", System.currentTimeMillis()).apply();
        }
    }

    String pairingToken(String code, String endpoint) throws IOException {
        String previous = values.getString("pairCode", "");
        String token = values.getString("pairToken", "");
        if (code.equals(previous) && endpoint.equals(values.getString("pairEndpoint", "")) && token.length() == 64) return token;
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder key = new StringBuilder(64);
        for (byte digit : bytes) {
            key.append(Character.forDigit((digit & 0xff) >>> 4, 16));
            key.append(Character.forDigit(digit & 0xf, 16));
        }
        token = key.toString();
        write(values.edit().putString("pairCode", code).putString("pairEndpoint", endpoint).putString("pairToken", token));
        return token;
    }

    void paired(String token, String endpoint) throws IOException {
        synchronized (REGISTRATION) {
            write(values.edit().putString("token", token).putString("endpoint", endpoint).putBoolean("enabled", true)
                    .remove("pairCode").remove("pairEndpoint").remove("pairToken"));
            status("登録済み・補充の条件待ち");
        }
    }

    void unpair() throws IOException {
        synchronized (REGISTRATION) {
            write(values.edit().clear());
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

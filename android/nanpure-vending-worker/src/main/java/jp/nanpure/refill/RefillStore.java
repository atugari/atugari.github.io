package jp.nanpure.refill;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.security.SecureRandom;

final class RefillStore {
    private final SharedPreferences values;

    RefillStore(Context context) {
        values = context.getSharedPreferences("refill", Context.MODE_PRIVATE);
    }

    String token() { return values.getString("token", ""); }
    String endpoint() { return values.getString("endpoint", BuildConfig.ENDPOINT); }
    boolean enabled() { return values.getBoolean("enabled", false); }
    boolean meteredAllowed() { return values.getBoolean("metered", false); }
    int sent() { return values.getInt("sent", 0); }
    long updated() { return values.getLong("updated", 0); }
    String status() { return values.getString("status", "未登録"); }

    void enabled(boolean enabled) { values.edit().putBoolean("enabled", enabled).apply(); }
    void meteredAllowed(boolean allowed) { values.edit().putBoolean("metered", allowed).apply(); }

    void status(String status) {
        values.edit().putString("status", status).putLong("updated", System.currentTimeMillis()).apply();
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
        write(values.edit().putString("token", token).putString("endpoint", endpoint).putBoolean("enabled", true)
                .remove("pairCode").remove("pairEndpoint").remove("pairToken"));
        status("登録済み・補充の条件待ち");
    }

    void unpair() throws IOException {
        write(values.edit().clear());
    }

    JSONObject pending() throws JSONException {
        String encoded = values.getString("pending", "");
        return encoded.isEmpty() ? null : new JSONObject(encoded);
    }

    void pending(JSONObject payload) throws IOException {
        write(values.edit().putString("pending", payload.toString()));
    }

    void clearPending(boolean accepted) throws IOException {
        SharedPreferences.Editor edit = values.edit().remove("pending");
        if (accepted) edit.putInt("sent", sent() + 1);
        write(edit);
    }

    private static void write(SharedPreferences.Editor edit) throws IOException {
        if (!edit.commit()) throw new IOException("Refill state could not be saved");
    }
}

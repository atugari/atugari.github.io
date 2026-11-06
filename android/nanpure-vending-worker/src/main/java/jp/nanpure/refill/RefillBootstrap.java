package jp.nanpure.refill;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/** A worker-only enrollment grant. Each installation creates and saves its own token. */
final class RefillBootstrap {
    private RefillBootstrap() {}

    static final class Config {
        final String endpoint;
        final String enrollmentKey;
        final String legacyTokenSha256;

        Config(JSONObject data) throws IOException, JSONException {
            Object format = data.get("format");
            if (!(format instanceof Number) || ((Number) format).doubleValue() != 2 || data.length() != 4) {
                throw new IOException("Unsupported automatic registration configuration");
            }
            Iterator<String> keys = data.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!"format".equals(key) && !"endpoint".equals(key) && !"enrollmentKey".equals(key) &&
                        !"legacyTokenSha256".equals(key)) throw new IOException("Unexpected registration configuration field");
            }
            if (!(data.get("endpoint") instanceof String) || !(data.get("enrollmentKey") instanceof String) ||
                    !(data.get("legacyTokenSha256") instanceof String)) throw new IOException("Invalid registration configuration");
            endpoint = data.getString("endpoint");
            enrollmentKey = data.getString("enrollmentKey");
            legacyTokenSha256 = data.getString("legacyTokenSha256");
            if (!BuildConfig.ENDPOINT.equals(endpoint) || !enrollmentKey.matches("[a-f0-9]{64}") ||
                    !legacyTokenSha256.matches("[a-f0-9]{64}")) throw new IOException("Invalid registration configuration");
        }
    }

    interface Transport {
        JSONObject call(String endpoint, JSONObject request) throws IOException, JSONException;
    }

    static boolean apply(Context context, RefillStore store) throws IOException, JSONException {
        Config config = load(context);
        return config != null && store.prepareEnrollment(config.endpoint, config.legacyTokenSha256) != null;
    }

    static Config load(Context context) throws IOException, JSONException {
        try (InputStream input = context.getAssets().open("refill-bootstrap.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > 8192) throw new IOException("Preset registration too large");
                bytes.write(buffer, 0, count);
            }
            return new Config(new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())));
        } catch (FileNotFoundException missing) {
            // Generic developer builds can still use the existing manual registration flow.
            return null;
        }
    }

    static boolean enroll(RefillStore store, Config config, RefillStore.EnrollmentAttempt attempt, String name,
            Transport transport) throws IOException, JSONException, InterruptedException {
        if (attempt == null || !attempt.endpoint.equals(config.endpoint)) return false;
        if (!store.persistEnrollment(attempt)) return false;
        store.enrollmentStatus(attempt, "このスマホを自動登録しています");
        String label = name == null ? "Android 高速版" : name.replaceAll("[\\p{Cntrl}]", " ").trim();
        if (label.isEmpty()) label = "Android 高速版";
        if (label.length() > 40) {
            int end = Character.isHighSurrogate(label.charAt(39)) ? 39 : 40;
            label = label.substring(0, end).trim();
        }
        JSONObject response = transport.call(config.endpoint, new JSONObject().put("action", "enroll")
                .put("enrollmentKey", config.enrollmentKey).put("token", attempt.token).put("name", label));
        if (!response.optBoolean("ok", false) || !(response.opt("id") instanceof String)) {
            throw new IOException("Invalid automatic registration response");
        }
        String deviceId = response.getString("id");
        // Network I/O runs without either lock. Finishing the token switch follows
        // the runner's existing EXCLUSIVE -> Store lock order and fences late responses.
        return RefillRunner.withRegistrationLock(() -> store.completeEnrollment(attempt, deviceId));
    }
}

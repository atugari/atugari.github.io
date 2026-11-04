package jp.nanpure.refill;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Imports a private, worker-only registration once. No administrator credential is used. */
final class RefillBootstrap {
    private RefillBootstrap() {}

    static boolean apply(Context context, RefillStore store) throws IOException, JSONException {
        if (store.bootstrapConsumed() || !store.token().isEmpty()) return false;
        try (InputStream input = context.getAssets().open("refill-bootstrap.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > 8192) throw new IOException("Preset registration too large");
                bytes.write(buffer, 0, count);
            }
            JSONObject config = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            if (config.optInt("format") != 1) throw new IOException("Unsupported preset registration");
            return store.applyBootstrap(config.getString("token"), config.getString("endpoint"));
        } catch (FileNotFoundException missing) {
            // Generic developer builds can still use the existing manual registration flow.
            return false;
        }
    }
}

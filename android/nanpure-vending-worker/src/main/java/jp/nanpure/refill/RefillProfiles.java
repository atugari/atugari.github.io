package jp.nanpure.refill;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class RefillProfiles {
    static final String PILOT_KEY = "normal:9:18:0::::";
    private static RefillProfiles catalogue;
    private final Map<String, Profile> byKey = new LinkedHashMap<>();
    private final List<Profile> ordered;

    private RefillProfiles(Context context) throws IOException {
        try (InputStream input = context.getAssets().open("profiles.json");
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int size;
            while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size);
            JSONArray array = new JSONArray(new String(output.toByteArray(), StandardCharsets.UTF_8));
            for (int i = 0; i < array.length(); i++) {
                Profile profile = new Profile(array.getJSONObject(i));
                if (byKey.put(profile.key, profile) != null) throw new IOException("Duplicate refill profile");
            }
        } catch (JSONException error) {
            throw new IOException("Invalid refill profiles", error);
        }
        if (!byKey.containsKey(PILOT_KEY)) throw new IOException("Missing pilot refill profile");
        ordered = Collections.unmodifiableList(new ArrayList<>(byKey.values()));
    }

    private static synchronized RefillProfiles get(Context context) throws IOException {
        if (catalogue == null) catalogue = new RefillProfiles(context);
        return catalogue;
    }

    static List<Profile> load(Context context) throws IOException {
        return get(context).ordered;
    }

    static Profile find(Context context, String key) throws IOException {
        return get(context).byKey.get(key);
    }

    static final class Profile {
        final String key, kind, multiShape, linkedShape;
        final int n, level, complexity;

        private Profile(JSONObject value) throws JSONException {
            key = value.getString("key");
            kind = value.getString("kind");
            n = value.getInt("n");
            level = value.getInt("level");
            complexity = value.optInt("complexity");
            multiShape = value.optString("multiShape");
            linkedShape = value.optString("linkedShape");
        }
    }
}

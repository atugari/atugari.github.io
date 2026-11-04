package android.content;

import java.util.LinkedHashMap;
import java.util.Map;

/** Values bound by the unchanged production Vault class. */
public final class ContentValues {
    private final Map<String, Object> values = new LinkedHashMap<>();
    public void put(String key, String value) { values.put(key, value); }
    public void put(String key, Integer value) { values.put(key, value); }
    public void put(String key, Long value) { values.put(key, value); }
    public void put(String key, byte[] value) { values.put(key, value); }
    public Map<String, Object> testValues() { return values; }
}

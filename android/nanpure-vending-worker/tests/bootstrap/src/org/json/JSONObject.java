package org.json;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.google.gson.JsonNull;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.Map;

/**
 * JSON adapter for the small surface exercised here, backed by installed Gson.
 * This harness tests registration lifecycle logic, not Android org.json conformance.
 */
public final class JSONObject {
    final JsonObject value;
    public JSONObject() { value = new JsonObject(); }
    JSONObject(JsonObject value) { this.value = value; }
    public JSONObject(String source) throws JSONException {
        try {
            JsonElement parsed = JsonParser.parseString(source);
            if (!parsed.isJsonObject()) throw new IllegalArgumentException("not an object");
            value = parsed.getAsJsonObject();
        } catch (RuntimeException error) { throw new JSONException("Invalid object", error); }
    }
    public String getString(String key) throws JSONException {
        JsonElement item = value.get(key);
        if (item == null || item.isJsonNull()) throw new JSONException("Missing string: " + key);
        try { return item.isJsonPrimitive() ? item.getAsString() : item.toString(); }
        catch (RuntimeException error) { throw new JSONException("Invalid string", error); }
    }
    public String optString(String key) {
        try { return getString(key); } catch (JSONException error) { return ""; }
    }
    public String optString(String key, String fallback) {
        try { return getString(key); } catch (JSONException error) { return fallback; }
    }
    public boolean has(String key) { return value.has(key); }
    public int length() { return value.size(); }
    public Iterator<String> keys() { return new ArrayList<>(value.keySet()).iterator(); }
    public Object get(String key) throws JSONException {
        if (!value.has(key)) throw new JSONException("Missing value: " + key);
        return unwrap(value.get(key));
    }
    public Object opt(String key) { return unwrap(value.get(key)); }
    public JSONObject getJSONObject(String key) throws JSONException {
        JsonElement item = value.get(key);
        if (item == null || !item.isJsonObject()) throw new JSONException("Missing object: " + key);
        return new JSONObject(item.getAsJsonObject());
    }
    public JSONObject optJSONObject(String key) {
        try { return getJSONObject(key); } catch (JSONException error) { return null; }
    }
    public JSONArray getJSONArray(String key) throws JSONException {
        JsonElement item = value.get(key);
        if (item == null || !item.isJsonArray()) throw new JSONException("Missing array: " + key);
        return new JSONArray(item.getAsJsonArray());
    }
    public JSONArray optJSONArray(String key) {
        try { return getJSONArray(key); } catch (JSONException error) { return null; }
    }
    public int getInt(String key) throws JSONException { return (int) getDouble(key); }
    public long getLong(String key) throws JSONException { return (long) getDouble(key); }
    private double getDouble(String key) throws JSONException {
        try {
            JsonElement item = value.get(key);
            if (item == null || !item.isJsonPrimitive() || item.getAsJsonPrimitive().isBoolean()) {
                throw new IllegalArgumentException("not numeric");
            }
            return Double.parseDouble(item.getAsString());
        } catch (RuntimeException error) { throw new JSONException("Invalid number: " + key, error); }
    }
    public int optInt(String key) {
        try {
            JsonElement item = value.get(key);
            if (item == null || item.isJsonNull() || !item.isJsonPrimitive()) return 0;
            JsonPrimitive primitive = item.getAsJsonPrimitive();
            if (primitive.isBoolean()) return 0;
            return (int) Double.parseDouble(primitive.getAsString());
        } catch (RuntimeException error) { return 0; }
    }
    public int optInt(String key, int fallback) {
        try { return getInt(key); } catch (JSONException error) { return fallback; }
    }
    public long optLong(String key, long fallback) {
        try { return getLong(key); } catch (JSONException error) { return fallback; }
    }
    public boolean getBoolean(String key) throws JSONException {
        String item = getString(key);
        if ("true".equalsIgnoreCase(item)) return true;
        if ("false".equalsIgnoreCase(item)) return false;
        throw new JSONException("Invalid boolean: " + key);
    }
    public boolean optBoolean(String key) { return optBoolean(key, false); }
    public boolean optBoolean(String key, boolean fallback) {
        try { return getBoolean(key); } catch (JSONException error) { return fallback; }
    }
    public JSONObject put(String key, Object item) {
        if (item == null) value.remove(key);
        else value.add(key, wrap(item));
        return this;
    }
    public Object remove(String key) { return unwrap(value.remove(key)); }
    public static String quote(String text) { return new JsonPrimitive(text == null ? "" : text).toString(); }
    static JsonElement wrap(Object item) {
        if (item == null) return JsonNull.INSTANCE;
        if (item instanceof JSONObject) return ((JSONObject) item).value;
        if (item instanceof JSONArray) return ((JSONArray) item).value;
        if (item instanceof String) return new JsonPrimitive((String) item);
        if (item instanceof Number) return new JsonPrimitive((Number) item);
        if (item instanceof Boolean) return new JsonPrimitive((Boolean) item);
        if (item instanceof Collection<?>) return new JSONArray((Collection<?>) item).value;
        if (item instanceof Map<?, ?>) {
            JSONObject object = new JSONObject();
            ((Map<?, ?>) item).forEach((key, child) -> object.put(String.valueOf(key), child));
            return object.value;
        }
        throw new IllegalArgumentException("Unsupported fixture type: " + item.getClass().getName());
    }
    static Object unwrap(JsonElement item) {
        if (item == null || item.isJsonNull()) return null;
        if (item.isJsonObject()) return new JSONObject(item.getAsJsonObject());
        if (item.isJsonArray()) return new JSONArray(item.getAsJsonArray());
        JsonPrimitive primitive = item.getAsJsonPrimitive();
        if (primitive.isBoolean()) return primitive.getAsBoolean();
        if (primitive.isNumber()) return primitive.getAsNumber();
        return primitive.getAsString();
    }
    @Override public String toString() { return value.toString(); }
}

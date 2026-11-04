package org.json;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

/**
 * JSON adapter for the small surface exercised here, backed by installed Gson.
 * This harness tests registration lifecycle logic, not Android org.json conformance.
 */
public final class JSONObject {
    private final JsonObject value;
    public JSONObject() { value = new JsonObject(); }
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
    public int optInt(String key) {
        try {
            JsonElement item = value.get(key);
            if (item == null || item.isJsonNull() || !item.isJsonPrimitive()) return 0;
            JsonPrimitive primitive = item.getAsJsonPrimitive();
            if (primitive.isBoolean()) return 0;
            return (int) Double.parseDouble(primitive.getAsString());
        } catch (RuntimeException error) { return 0; }
    }
    public JSONObject put(String key, Object item) {
        if (item == null) value.remove(key);
        else if (item instanceof String) value.addProperty(key, (String) item);
        else if (item instanceof Number) value.addProperty(key, (Number) item);
        else if (item instanceof Boolean) value.addProperty(key, (Boolean) item);
        else throw new IllegalArgumentException("Unsupported fixture type");
        return this;
    }
    @Override public String toString() { return value.toString(); }
}

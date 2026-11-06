package org.json;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.util.Collection;

/** Minimal Gson-backed adapter; not an Android org.json conformance test. */
public final class JSONArray {
    final JsonArray value;
    public JSONArray() { value = new JsonArray(); }
    JSONArray(JsonArray value) { this.value = value; }
    public JSONArray(Collection<?> source) {
        value = new JsonArray();
        source.forEach(item -> value.add(JSONObject.wrap(item)));
    }
    public JSONArray(String source) throws JSONException {
        try {
            JsonElement parsed = JsonParser.parseString(source);
            if (!parsed.isJsonArray()) throw new IllegalArgumentException("not an array");
            value = parsed.getAsJsonArray();
        } catch (RuntimeException error) { throw new JSONException("Invalid array", error); }
    }
    public int length() { return value.size(); }
    public JSONArray put(Object item) { value.add(JSONObject.wrap(item)); return this; }
    public Object get(int index) throws JSONException {
        try { return JSONObject.unwrap(value.get(index)); }
        catch (RuntimeException error) { throw new JSONException("Missing array entry", error); }
    }
    public String getString(int index) throws JSONException {
        Object item = get(index);
        if (item == null) throw new JSONException("Missing string");
        return item.toString();
    }
    public int getInt(int index) throws JSONException {
        Object item = get(index);
        try { return item instanceof Number ? ((Number) item).intValue() : (int) Double.parseDouble(String.valueOf(item)); }
        catch (RuntimeException error) { throw new JSONException("Invalid integer", error); }
    }
    public JSONObject getJSONObject(int index) throws JSONException {
        Object item = get(index);
        if (!(item instanceof JSONObject)) throw new JSONException("Missing object");
        return (JSONObject) item;
    }
    public JSONArray getJSONArray(int index) throws JSONException {
        Object item = get(index);
        if (!(item instanceof JSONArray)) throw new JSONException("Missing array");
        return (JSONArray) item;
    }
    @Override public String toString() { return value.toString(); }
}

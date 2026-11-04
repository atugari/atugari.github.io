package android.database.sqlite;

import android.content.ContentValues;
import android.database.Cursor;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;

/**
 * Android's small SQL surface backed by a real, temporary Python SQLite database.
 * SQL text, parameters, transactions, constraints and triggers come from production.
 */
public final class SQLiteDatabase implements AutoCloseable {
    private static final Gson JSON = new Gson();
    private static SQLiteDatabase lastOpened;
    private final Process process;
    private final BufferedReader input;
    private final BufferedWriter output;
    private boolean inTransaction;
    private boolean transactionSuccessful;
    private boolean closed;

    SQLiteDatabase(File file) {
        try {
            process = new ProcessBuilder(System.getProperty("refill.test.python"),
                    "-u", System.getProperty("refill.test.sqlite.bridge"), file.getAbsolutePath())
                    .redirectError(ProcessBuilder.Redirect.INHERIT).start();
            input = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
            output = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            lastOpened = this;
        } catch (IOException error) { throw new IllegalStateException("Cannot start local SQLite test adapter", error); }
    }

    public static SQLiteDatabase lastOpenedForTest() { return lastOpened; }

    private synchronized JsonObject command(Map<String, Object> request) {
        if (closed) throw new IllegalStateException("SQLite adapter closed");
        try {
            output.write(JSON.toJson(request));
            output.newLine();
            output.flush();
            String line = input.readLine();
            if (line == null) throw new IOException("SQLite test process stopped");
            JsonObject response = JsonParser.parseString(line).getAsJsonObject();
            if (!response.get("ok").getAsBoolean()) {
                String message = response.get("error").getAsString();
                if (message.contains("database or disk is full")) throw new SQLiteFullException(message);
                throw new IllegalStateException("SQLite: " + message);
            }
            return response;
        } catch (IOException error) { throw new IllegalStateException("SQLite test transport failed", error); }
    }

    private JsonObject sql(String statement, Object[] arguments) {
        List<Object> encoded = new ArrayList<>();
        if (arguments != null) {
            for (Object value : arguments) {
                encoded.add(value instanceof byte[]
                        ? Map.of("__bytes__", Base64.getEncoder().encodeToString((byte[]) value)) : value);
            }
        }
        return command(Map.of("operation", "sql", "sql", statement, "arguments", encoded));
    }

    public void failNextForTest(String sqlPrefix, String message) {
        command(Map.of("operation", "fault", "sql_prefix", sqlPrefix, "message", message));
    }
    public void setForeignKeyConstraintsEnabled(boolean enabled) { execSQL("PRAGMA foreign_keys=" + (enabled ? "ON" : "OFF")); }
    public boolean isReadOnly() { return false; }
    public long setMaximumSize(long bytes) { return bytes; }
    public void execSQL(String statement) { sql(statement, null); }
    public void execSQL(String statement, Object[] arguments) { sql(statement, arguments); }
    public Cursor rawQuery(String statement, String[] arguments) { return new Rows(sql(statement, arguments).getAsJsonArray("rows")); }

    public Cursor query(String table, String[] columns, String selection, String[] arguments,
                        String groupBy, String having, String orderBy, String limit) {
        StringBuilder statement = new StringBuilder("SELECT ").append(String.join(",", columns)).append(" FROM ").append(table);
        if (selection != null) statement.append(" WHERE ").append(selection);
        if (groupBy != null) statement.append(" GROUP BY ").append(groupBy);
        if (having != null) statement.append(" HAVING ").append(having);
        if (orderBy != null) statement.append(" ORDER BY ").append(orderBy);
        if (limit != null) statement.append(" LIMIT ").append(limit);
        return rawQuery(statement.toString(), arguments);
    }

    public Cursor query(String table, String[] columns, String selection, String[] arguments,
                        String groupBy, String having, String orderBy) {
        return query(table, columns, selection, arguments, groupBy, having, orderBy, null);
    }

    private long insert(String operation, String table, ContentValues values) {
        Map<String, Object> data = values.testValues();
        String[] markers = new String[data.size()];
        Arrays.fill(markers, "?");
        JsonObject result = sql(operation + " INTO " + table + " (" + String.join(",", data.keySet()) + ") VALUES ("
                + String.join(",", markers) + ")", data.values().toArray());
        JsonElement id = result.get("insert_id");
        return id == null || id.isJsonNull() ? -1 : id.getAsLong();
    }
    public long insertOrThrow(String table, String nullColumnHack, ContentValues values) { return insert("INSERT", table, values); }
    public long replaceOrThrow(String table, String nullColumnHack, ContentValues values) { return insert("INSERT OR REPLACE", table, values); }
    public int delete(String table, String where, String[] arguments) {
        return sql("DELETE FROM " + table + (where == null ? "" : " WHERE " + where), arguments).get("changed").getAsInt();
    }

    public synchronized void beginTransactionNonExclusive() {
        if (inTransaction) throw new IllegalStateException("Nested transactions are outside this test adapter");
        execSQL("BEGIN IMMEDIATE");
        inTransaction = true;
        transactionSuccessful = false;
    }
    public synchronized void setTransactionSuccessful() {
        if (!inTransaction) throw new IllegalStateException("No transaction");
        transactionSuccessful = true;
    }
    public synchronized void endTransaction() {
        if (!inTransaction) throw new IllegalStateException("No transaction");
        try { execSQL(transactionSuccessful ? "COMMIT" : "ROLLBACK"); }
        finally { inTransaction = false; transactionSuccessful = false; }
    }

    @Override public synchronized void close() {
        if (closed) return;
        command(Map.of("operation", "close"));
        closed = true;
        try {
            output.close();
            input.close();
            process.waitFor();
        } catch (IOException error) { throw new IllegalStateException(error); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
    }

    private static final class Rows implements Cursor {
        private final JsonArray values;
        private int row = -1;
        Rows(JsonArray values) { this.values = values; }
        @Override public boolean moveToFirst() { row = 0; return row < values.size(); }
        @Override public boolean moveToNext() { row++; return row < values.size(); }
        private JsonElement cell(int column) { return values.get(row).getAsJsonArray().get(column); }
        @Override public String getString(int column) { return cell(column).isJsonNull() ? null : cell(column).getAsString(); }
        @Override public long getLong(int column) { return cell(column).getAsLong(); }
        @Override public byte[] getBlob(int column) {
            return Base64.getDecoder().decode(cell(column).getAsJsonObject().get("__bytes__").getAsString());
        }
        @Override public void close() {}
    }
}

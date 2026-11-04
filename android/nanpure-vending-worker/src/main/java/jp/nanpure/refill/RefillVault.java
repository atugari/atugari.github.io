package jp.nanpure.refill;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.DatabaseUtils;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteFullException;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/** Durable local stock. Call from a worker thread. */
final class RefillVault {
    static final long LIMIT_BYTES = 32_000_000_000L;
    static final long RESERVE_BYTES = 8_000_000_000L;
    private static final long JOURNAL_HEADROOM = 64 * 1024 * 1024;
    private static final long WRITE_HEADROOM = 256 * 1024;
    private static final int ROW_ALLOWANCE = 512;
    private static final int MAX_JSON_BYTES = 2 * 1024 * 1024;
    private static final int MAX_BLOB_BYTES = 512 * 1024;
    private static final String DATABASE_NAME = "refill-vault.db";
    private static final String[] ENTRY_COLUMNS = {"id", "profile", "payload"};
    private static final String[] IDENTITY_KEYS = {"kind", "n", "puzzle", "regions", "cages", "links", "steps",
            "crosses", "clues", "linked", "kropkiMode"};

    private static Helper helper;
    private final Helper database;
    private final File databaseFile;
    private final File dataDirectory;
    private final String endpoint;
    private final String scope;

    RefillVault(Context context, String endpoint) {
        Context app = context.getApplicationContext();
        database = helper(app);
        databaseFile = app.getDatabasePath(DATABASE_NAME);
        dataDirectory = app.getFilesDir();
        this.endpoint = endpoint;
        scope = digest(endpoint);
    }

    private static synchronized Helper helper(Context context) {
        if (helper == null) helper = new Helper(context);
        return helper;
    }

    enum Save { STORED, DUPLICATE, NO_SPACE }

    static final class Entry {
        final long id;
        final String profile;
        final JSONObject puzzle;

        private Entry(long id, String profile, JSONObject puzzle) {
            this.id = id;
            this.profile = profile;
            this.puzzle = puzzle;
        }
    }

    static final class Delivery {
        final Entry entry;
        final JSONObject request;
        private final String scope;
        private final String owner;
        private final String job;
        private final String lease;

        private Delivery(Entry entry, String scope, String owner, String job, String lease) throws JSONException {
            this.entry = entry;
            this.scope = scope;
            this.owner = owner;
            this.job = job;
            this.lease = lease;
            request = new JSONObject().put("action", "result").put("id", job)
                    .put("lease", lease).put("p", entry.puzzle);
        }

        private String[] key() {
            return new String[]{scope, owner, job, lease, Long.toString(entry.id)};
        }
    }

    private static final String DELIVERY_KEY = "scope=? AND owner=? AND job=? AND lease=? AND entry_id=?";

    boolean canStore() {
        if (dataDirectory.getUsableSpace() < RESERVE_BYTES + WRITE_HEADROOM) return false;
        return hasSpace(database.getWritableDatabase(), 0);
    }

    Save save(String profile, JSONObject puzzle) throws IOException, JSONException {
        String uid = puzzle.getString("uid");
        if (profile.isEmpty() || profile.length() > 256 || uid.isEmpty() || uid.length() > 128) {
            throw new IOException("Invalid vault identity");
        }
        if (dataDirectory.getUsableSpace() < RESERVE_BYTES + WRITE_HEADROOM) return Save.NO_SPACE;
        byte[] payload = encode(puzzle);
        String identity = identity(puzzle);
        SQLiteDatabase db = database.getWritableDatabase();
        db.beginTransactionNonExclusive();
        try {
            if (exists(db, uid, identity)) return Save.DUPLICATE;
            if (!hasSpace(db, payload.length)) return Save.NO_SPACE;
            ContentValues values = new ContentValues();
            values.put("scope", scope);
            values.put("profile", profile);
            values.put("uid", uid);
            values.put("digest", identity);
            values.put("payload", payload);
            values.put("bytes", payload.length);
            db.insertOrThrow("vault_entries", null, values);
            db.setTransactionSuccessful();
            return Save.STORED;
        } catch (SQLiteFullException full) {
            return Save.NO_SPACE;
        } finally {
            db.endTransaction();
        }
    }

    private boolean exists(SQLiteDatabase db, String uid, String identity) {
        return DatabaseUtils.longForQuery(db,
                "SELECT EXISTS(SELECT 1 FROM vault_entries WHERE scope=? AND uid=?)"
                        + " OR EXISTS(SELECT 1 FROM vault_entries WHERE scope=? AND digest=?)",
                new String[]{scope, uid, scope, identity}) != 0;
    }

    private boolean hasSpace(SQLiteDatabase db, long incoming) {
        long headroom = WRITE_HEADROOM + 2 * incoming;
        if (dataDirectory.getUsableSpace() < RESERVE_BYTES + headroom) return false;
        long used = DatabaseUtils.longForQuery(db, "SELECT COALESCE(SUM(bytes + count * " + ROW_ALLOWANCE
                + "),0) FROM vault_totals", null);
        if (used + incoming + ROW_ALLOWANCE > LIMIT_BYTES - JOURNAL_HEADROOM) return false;
        long sidecars = new File(databaseFile + "-wal").length() + new File(databaseFile + "-shm").length()
                + new File(databaseFile + "-journal").length();
        if (databaseFile.length() + sidecars + headroom <= LIMIT_BYTES - JOURNAL_HEADROOM) return true;
        long freePages = DatabaseUtils.longForQuery(db, "PRAGMA freelist_count", null);
        long pageSize = DatabaseUtils.longForQuery(db, "PRAGMA page_size", null);
        return databaseFile.length() + sidecars <= LIMIT_BYTES - JOURNAL_HEADROOM && freePages * pageSize >= headroom;
    }

    Entry first(String profile) throws IOException, JSONException {
        return readEntry("scope=? AND profile=?", new String[]{scope, profile});
    }

    Entry find(String profile, JSONObject puzzle) throws IOException, JSONException {
        Entry byUid = readEntry("scope=? AND uid=? AND profile=?", new String[]{scope, puzzle.getString("uid"), profile});
        if (byUid != null) return byUid;
        return readEntry("scope=? AND digest=? AND profile=?", new String[]{scope, identity(puzzle), profile});
    }

    private Entry readEntry(String where, String[] args) throws IOException, JSONException {
        try (Cursor row = database.getReadableDatabase().query("vault_entries", ENTRY_COLUMNS, where, args,
                null, null, "id ASC", "1")) {
            return row.moveToFirst() ? entry(row) : null;
        }
    }

    private static Entry entry(Cursor row) throws IOException, JSONException {
        return new Entry(row.getLong(0), row.getString(1), decode(row.getBlob(2)));
    }

    long count(String profile) {
        return DatabaseUtils.longForQuery(database.getReadableDatabase(),
                "SELECT COALESCE((SELECT count FROM vault_counts WHERE scope=? AND profile=?),0)",
                new String[]{scope, profile});
    }

    long count() { return total("count"); }
    long bytes() { return total("bytes"); }

    private long total(String column) {
        return DatabaseUtils.longForQuery(database.getReadableDatabase(),
                "SELECT COALESCE((SELECT " + column + " FROM vault_totals WHERE scope=?),0)", new String[]{scope});
    }

    Map<String, Long> counts() {
        Map<String, Long> result = new LinkedHashMap<>();
        try (Cursor rows = database.getReadableDatabase().query("vault_counts", new String[]{"profile", "count"},
                "scope=?", new String[]{scope}, null, null, "profile ASC")) {
            while (rows.moveToNext()) result.put(rows.getString(0), rows.getLong(1));
        }
        return result;
    }

    void discard(Entry entry) {
        database.getWritableDatabase().delete("vault_entries", "scope=? AND id=?", new String[]{scope, Long.toString(entry.id)});
    }

    void assign(String token, String endpoint, Entry entry, JSONObject job) throws IOException, JSONException {
        String owner = owner(token, endpoint);
        SQLiteDatabase db = database.getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put("scope", scope);
        values.put("owner", owner);
        values.put("entry_id", entry.id);
        values.put("job", job.getString("id"));
        values.put("lease", job.getString("lease"));
        db.beginTransactionNonExclusive();
        try {
            if (DatabaseUtils.longForQuery(db, "SELECT EXISTS(SELECT 1 FROM vault_entries WHERE scope=? AND id=?)",
                    new String[]{scope, Long.toString(entry.id)}) == 0) throw new IOException("Vault entry no longer exists");
            if (DatabaseUtils.longForQuery(db, "SELECT EXISTS(SELECT 1 FROM vault_deliveries WHERE scope=? AND owner=?)",
                    new String[]{scope, owner}) != 0) throw new IOException("Resolve the current vault delivery first");
            if (db.replaceOrThrow("vault_deliveries", null, values) == -1) throw new IOException("Vault assignment not saved");
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    Delivery pending(String token, String endpoint) throws IOException, JSONException {
        String owner = owner(token, endpoint);
        try (Cursor row = database.getReadableDatabase().rawQuery(
                "SELECT e.id,e.profile,e.payload,d.job,d.lease FROM vault_deliveries d "
                        + "JOIN vault_entries e ON e.id=d.entry_id AND e.scope=d.scope WHERE d.scope=? AND d.owner=?",
                new String[]{scope, owner})) {
            return row.moveToFirst() ? new Delivery(entry(row), scope, owner, row.getString(3), row.getString(4)) : null;
        }
    }

    void release(Delivery delivery) {
        checkScope(delivery);
        database.getWritableDatabase().delete("vault_deliveries", DELIVERY_KEY, delivery.key());
    }

    long acknowledge(Delivery delivery) {
        checkScope(delivery);
        SQLiteDatabase db = database.getWritableDatabase();
        db.beginTransactionNonExclusive();
        try {
            if (db.delete("vault_deliveries", DELIVERY_KEY, delivery.key()) == 1) {
                discard(delivery.entry);
                ensureSent(db, delivery.owner, 0);
                db.execSQL("UPDATE vault_sent SET count=count+1 WHERE scope=? AND owner=?", new Object[]{scope, delivery.owner});
            }
            long count = sent(db, delivery.owner);
            db.setTransactionSuccessful();
            return count;
        } finally {
            db.endTransaction();
        }
    }

    private void checkScope(Delivery delivery) {
        if (!scope.equals(delivery.scope)) throw new IllegalArgumentException("Delivery belongs to another endpoint");
    }

    long sent(String token, String endpoint, long previous) {
        String owner = owner(token, endpoint);
        SQLiteDatabase db = database.getWritableDatabase();
        long count = sent(db, owner);
        if (count >= 0) return count;
        ensureSent(db, owner, previous);
        return sent(db, owner);
    }

    private long sent(SQLiteDatabase db, String owner) {
        return DatabaseUtils.longForQuery(db, "SELECT COALESCE((SELECT count FROM vault_sent WHERE scope=? AND owner=?),-1)",
                new String[]{scope, owner});
    }

    private void ensureSent(SQLiteDatabase db, String owner, long previous) {
        db.execSQL("INSERT OR IGNORE INTO vault_sent (scope,owner,count) VALUES (?,?,?)",
                new Object[]{scope, owner, Math.max(0, previous)});
    }

    private String owner(String token, String requestedEndpoint) {
        if (!endpoint.equals(requestedEndpoint) || token.isEmpty()) throw new IllegalArgumentException("Invalid vault registration");
        return digest(token);
    }

    private static byte[] encode(JSONObject puzzle) throws IOException {
        byte[] raw = puzzle.toString().getBytes(StandardCharsets.UTF_8);
        if (raw.length > MAX_JSON_BYTES) throw new IOException("Vault record too large");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (GZIPOutputStream compressed = new GZIPOutputStream(bytes)) { compressed.write(raw); }
        if (bytes.size() > MAX_BLOB_BYTES) throw new IOException("Compressed vault record too large");
        return bytes.toByteArray();
    }

    private static JSONObject decode(byte[] payload) throws IOException, JSONException {
        if (payload.length > MAX_BLOB_BYTES) throw new IOException("Compressed vault record too large");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (GZIPInputStream input = new GZIPInputStream(new ByteArrayInputStream(payload))) {
            byte[] buffer = new byte[8192];
            int size;
            while ((size = input.read(buffer)) != -1) {
                if (bytes.size() + size > MAX_JSON_BYTES) throw new IOException("Vault record too large");
                bytes.write(buffer, 0, size);
            }
        }
        return new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
    }

    private static String identity(JSONObject puzzle) throws JSONException {
        if (puzzle.optString("kind").isEmpty() || puzzle.optInt("n") < 1 || puzzle.optJSONArray("puzzle") == null) {
            throw new JSONException("Vault record has no board identity");
        }
        Map<String, String> fields = new TreeMap<>();
        for (String key : IDENTITY_KEYS) {
            if (!puzzle.has(key)) continue;
            switch (key) {
                case "regions":
                    if ("jigsaw".equals(puzzle.optString("kind"))) fields.put(key, regionIdentity(puzzle.getJSONArray(key)));
                    break;
                case "cages": case "links": case "steps": case "crosses": case "clues":
                    JSONArray rules = puzzle.optJSONArray(key);
                    fields.put(key, rules == null ? canonical(puzzle.get(key)) : ruleIdentity(key, rules));
                    break;
                default:
                    fields.put(key, canonical(puzzle.get(key)));
                    break;
            }
        }
        StringBuilder out = new StringBuilder("{");
        for (Map.Entry<String, String> field : fields.entrySet()) {
            if (out.length() > 1) out.append(',');
            out.append(JSONObject.quote(field.getKey())).append(':').append(field.getValue());
        }
        return digest(out.append('}').toString());
    }

    private static String regionIdentity(JSONArray regions) throws JSONException {
        Map<String, Integer> ids = new LinkedHashMap<>();
        JSONArray normalized = new JSONArray();
        for (int i = 0; i < regions.length(); i++) {
            String label = regions.getString(i);
            if (!ids.containsKey(label)) ids.put(label, ids.size());
            normalized.put(ids.get(label));
        }
        return normalized.toString();
    }

    private static String ruleIdentity(String key, JSONArray rules) throws JSONException {
        ArrayList<String> normalized = new ArrayList<>();
        for (int i = 0; i < rules.length(); i++) {
            Object rule = rules.get(i);
            if ("cages".equals(key) && rule instanceof JSONObject) {
                JSONObject cage = new JSONObject(rule.toString());
                cage.put("cells", orderedCells(cage.getJSONArray("cells")));
                rule = cage;
            } else if ("links".equals(key) && rule instanceof JSONArray) {
                rule = orderedCells((JSONArray) rule);
            }
            normalized.add(canonical(rule));
        }
        Collections.sort(normalized);
        return "[" + String.join(",", normalized) + "]";
    }

    private static JSONArray orderedCells(JSONArray source) throws JSONException {
        ArrayList<Integer> indices = new ArrayList<>();
        for (int i = 0; i < source.length(); i++) indices.add(source.getInt(i));
        Collections.sort(indices);
        return new JSONArray(indices);
    }

    private static String canonical(Object value) throws JSONException {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            ArrayList<String> keys = new ArrayList<>();
            Iterator<String> names = object.keys();
            while (names.hasNext()) keys.add(names.next());
            Collections.sort(keys);
            StringBuilder out = new StringBuilder("{");
            for (String key : keys) {
                if (out.length() > 1) out.append(',');
                out.append(JSONObject.quote(key)).append(':').append(canonical(object.get(key)));
            }
            return out.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder out = new StringBuilder("[");
            for (int index = 0; index < array.length(); index++) {
                if (index > 0) out.append(',');
                out.append(canonical(array.get(index)));
            }
            return out.append(']').toString();
        }
        return value instanceof String ? JSONObject.quote((String) value) : String.valueOf(value);
    }

    private static String digest(String value) {
        byte[] bytes;
        try {
            bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException(unavailable);
        }
        StringBuilder encoded = new StringBuilder(bytes.length * 2);
        for (byte digit : bytes) {
            encoded.append(Character.forDigit((digit & 0xff) >>> 4, 16));
            encoded.append(Character.forDigit(digit & 0xf, 16));
        }
        return encoded.toString();
    }

    private static final class Helper extends SQLiteOpenHelper {
        Helper(Context context) {
            super(context, DATABASE_NAME, null, 1);
            setWriteAheadLoggingEnabled(true);
        }

        @Override public void onConfigure(SQLiteDatabase db) { db.setForeignKeyConstraintsEnabled(true); }

        @Override public void onOpen(SQLiteDatabase db) {
            if (!db.isReadOnly()) db.setMaximumSize(LIMIT_BYTES - JOURNAL_HEADROOM);
        }

        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE vault_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, profile TEXT NOT NULL, "
                    + "uid TEXT NOT NULL, digest TEXT NOT NULL, payload BLOB NOT NULL, bytes INTEGER NOT NULL, "
                    + "UNIQUE(scope,uid), UNIQUE(scope,digest))");
            db.execSQL("CREATE INDEX vault_fifo ON vault_entries(scope,profile,id)");
            db.execSQL("CREATE TABLE vault_totals (scope TEXT PRIMARY KEY, count INTEGER NOT NULL, bytes INTEGER NOT NULL) WITHOUT ROWID");
            db.execSQL("CREATE TABLE vault_counts (scope TEXT NOT NULL, profile TEXT NOT NULL, count INTEGER NOT NULL, "
                    + "PRIMARY KEY(scope,profile)) WITHOUT ROWID");
            db.execSQL("CREATE TABLE vault_deliveries (scope TEXT PRIMARY KEY, owner TEXT NOT NULL, "
                    + "entry_id INTEGER NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE, "
                    + "job TEXT NOT NULL, lease TEXT NOT NULL) WITHOUT ROWID");
            db.execSQL("CREATE INDEX vault_delivery_entry ON vault_deliveries(entry_id)");
            db.execSQL("CREATE TABLE vault_sent (scope TEXT NOT NULL, owner TEXT NOT NULL, count INTEGER NOT NULL, "
                    + "PRIMARY KEY(scope,owner)) WITHOUT ROWID");
            db.execSQL("CREATE TRIGGER vault_insert AFTER INSERT ON vault_entries BEGIN "
                    + "INSERT OR IGNORE INTO vault_totals VALUES (NEW.scope,0,0); "
                    + "UPDATE vault_totals SET count=count+1, bytes=bytes+NEW.bytes WHERE scope=NEW.scope; "
                    + "INSERT OR IGNORE INTO vault_counts VALUES (NEW.scope,NEW.profile,0); "
                    + "UPDATE vault_counts SET count=count+1 WHERE scope=NEW.scope AND profile=NEW.profile; END");
            db.execSQL("CREATE TRIGGER vault_delete AFTER DELETE ON vault_entries BEGIN "
                    + "UPDATE vault_totals SET count=count-1, bytes=bytes-OLD.bytes WHERE scope=OLD.scope; "
                    + "UPDATE vault_counts SET count=count-1 WHERE scope=OLD.scope AND profile=OLD.profile; "
                    + "DELETE FROM vault_counts WHERE scope=OLD.scope AND profile=OLD.profile AND count=0; END");
        }

        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            throw new IllegalStateException("Unsupported refill vault schema upgrade");
        }
    }
}

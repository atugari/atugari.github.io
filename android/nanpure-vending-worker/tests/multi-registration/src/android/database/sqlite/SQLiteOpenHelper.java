package android.database.sqlite;

import android.content.Context;
import android.database.DatabaseUtils;

/** Creates the test database using the production helper's schema callbacks. */
public abstract class SQLiteOpenHelper implements AutoCloseable {
    private final Context context;
    private final String name;
    private final int version;
    private boolean wal;
    private SQLiteDatabase database;
    protected SQLiteOpenHelper(Context context, String name, Object factory, int version) {
        this.context = context;
        this.name = name;
        this.version = version;
    }
    public void setWriteAheadLoggingEnabled(boolean enabled) { wal = enabled; }
    public synchronized SQLiteDatabase getWritableDatabase() {
        if (database != null) return database;
        database = new SQLiteDatabase(context.getDatabasePath(name));
        if (wal) database.execSQL("PRAGMA journal_mode=WAL");
        onConfigure(database);
        int old = (int) DatabaseUtils.longForQuery(database, "PRAGMA user_version", null);
        if (old != version) {
            database.beginTransactionNonExclusive();
            try {
                if (old == 0) onCreate(database);
                else onUpgrade(database, old, version);
                database.execSQL("PRAGMA user_version=" + version);
                database.setTransactionSuccessful();
            } finally { database.endTransaction(); }
        }
        onOpen(database);
        return database;
    }
    public SQLiteDatabase getReadableDatabase() { return getWritableDatabase(); }
    public void onConfigure(SQLiteDatabase database) {}
    public void onOpen(SQLiteDatabase database) {}
    public abstract void onCreate(SQLiteDatabase database);
    public abstract void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion);
    @Override public void close() { if (database != null) database.close(); }
}

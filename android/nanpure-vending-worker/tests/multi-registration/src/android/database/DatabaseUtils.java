package android.database;

import android.database.sqlite.SQLiteDatabase;

public final class DatabaseUtils {
    private DatabaseUtils() {}
    public static long longForQuery(SQLiteDatabase database, String sql, String[] arguments) {
        try (Cursor result = database.rawQuery(sql, arguments)) {
            if (!result.moveToFirst()) throw new IllegalStateException("Query returned no first value");
            return result.getLong(0);
        }
    }
}

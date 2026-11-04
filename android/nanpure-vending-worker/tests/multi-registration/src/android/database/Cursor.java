package android.database;

/** The cursor methods exercised by the production Vault. */
public interface Cursor extends AutoCloseable {
    boolean moveToFirst();
    boolean moveToNext();
    String getString(int column);
    long getLong(int column);
    byte[] getBlob(int column);
    @Override void close();
}

package android.content;

/** Minimal Android interface surface, implemented by the test's memory/disk model. */
public interface SharedPreferences {
    String getString(String key, String fallback);
    boolean getBoolean(String key, boolean fallback);
    int getInt(String key, int fallback);
    long getLong(String key, long fallback);
    Editor edit();

    interface Editor {
        Editor putString(String key, String value);
        Editor putBoolean(String key, boolean value);
        Editor putInt(String key, int value);
        Editor putLong(String key, long value);
        Editor remove(String key);
        Editor clear();
        void apply();
        boolean commit();
    }
}

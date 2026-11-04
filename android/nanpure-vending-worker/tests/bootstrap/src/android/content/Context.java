package android.content;

import android.content.res.AssetManager;
import java.io.File;

/** Only the Android context surface used by the production classes under test. */
public abstract class Context {
    public static final int MODE_PRIVATE = 0;
    public abstract SharedPreferences getSharedPreferences(String name, int mode);
    public abstract AssetManager getAssets();
    public Context getApplicationContext() { return this; }
    public File getDatabasePath(String name) { throw new UnsupportedOperationException("No test database configured"); }
    public File getFilesDir() { throw new UnsupportedOperationException("No test files directory configured"); }
}

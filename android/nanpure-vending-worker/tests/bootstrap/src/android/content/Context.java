package android.content;

import android.content.res.AssetManager;

/** Only the two Android context methods used by the production classes. */
public abstract class Context {
    public static final int MODE_PRIVATE = 0;
    public abstract SharedPreferences getSharedPreferences(String name, int mode);
    public abstract AssetManager getAssets();
}

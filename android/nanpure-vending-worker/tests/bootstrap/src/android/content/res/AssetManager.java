package android.content.res;

import java.io.IOException;
import java.io.InputStream;

/** Test double entry point; no Android SDK, assets or network service is contacted. */
public abstract class AssetManager {
    public abstract InputStream open(String name) throws IOException;
}

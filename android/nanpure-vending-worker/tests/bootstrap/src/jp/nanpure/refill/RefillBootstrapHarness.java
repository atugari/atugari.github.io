package jp.nanpure.refill;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import com.google.gson.Gson;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Runs the unmodified production Store and Bootstrap classes against controlled adapters. */
public final class RefillBootstrapHarness {
    private static final String OLD_PACKAGE = "jp.nanpure.refill";
    private static final String FAST_PACKAGE = "jp.nanpure.refill.fast";
    private static final String DUMMY_A = "a".repeat(64);
    private static final String DUMMY_B = "b".repeat(64);
    private static final List<String> passed = new ArrayList<>();
    private static int assertions;

    @FunctionalInterface interface Checked { void run() throws Exception; }
    @FunctionalInterface interface OpenHook { void run() throws IOException; }

    private static void check(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }
    private static void equal(Object actual, Object expected, String message) {
        check(Objects.equals(actual, expected), message);
    }
    private static void fails(Checked action, String message) throws Exception {
        try { action.run(); }
        catch (IOException | JSONException expected) { assertions++; return; }
        throw new AssertionError(message);
    }
    private static void test(String name, Checked body) throws Exception { body.run(); passed.add(name); }

    /** Package-scoped persistent stores, matching the boundary the Android Context supplies. */
    static final class Device {
        final Map<String, Map<String, Object>> disk = new HashMap<>();
        final Map<String, MemoryPreferences> process = new HashMap<>();
        synchronized MemoryPreferences preferences(String packageName, String name) {
            String key = packageName + "/" + name;
            return process.computeIfAbsent(key, ignored -> new MemoryPreferences(
                    disk.computeIfAbsent(key, unused -> new HashMap<>())));
        }
        synchronized void restart(String packageName) { process.keySet().removeIf(key -> key.startsWith(packageName + "/")); }
        synchronized Map<String, Object> durable(String packageName) {
            return Map.copyOf(disk.getOrDefault(packageName + "/refill", Map.of()));
        }
    }

    static final class MemoryPreferences implements SharedPreferences {
        final Map<String, Object> durable;
        final Map<String, Object> memory;
        boolean failNextCommit;
        int commits;
        MemoryPreferences(Map<String, Object> durable) { this.durable = durable; memory = new HashMap<>(durable); }
        @Override public synchronized String getString(String key, String fallback) { return (String) memory.getOrDefault(key, fallback); }
        @Override public synchronized boolean getBoolean(String key, boolean fallback) { return (Boolean) memory.getOrDefault(key, fallback); }
        @Override public synchronized int getInt(String key, int fallback) { return (Integer) memory.getOrDefault(key, fallback); }
        @Override public synchronized long getLong(String key, long fallback) { return (Long) memory.getOrDefault(key, fallback); }
        @Override public Editor edit() { return new Edit(); }
        final class Edit implements SharedPreferences.Editor {
            final Map<String, Object> changes = new HashMap<>();
            boolean clear;
            @Override public Editor putString(String key, String value) { changes.put(key, value); return this; }
            @Override public Editor putBoolean(String key, boolean value) { changes.put(key, value); return this; }
            @Override public Editor putInt(String key, int value) { changes.put(key, value); return this; }
            @Override public Editor putLong(String key, long value) { changes.put(key, value); return this; }
            @Override public Editor remove(String key) { changes.put(key, null); return this; }
            @Override public Editor clear() { clear = true; return this; }
            @Override public void apply() { commit(); }
            @Override public boolean commit() {
                synchronized (MemoryPreferences.this) {
                    commits++;
                    if (clear) memory.clear();
                    changes.forEach((key, value) -> { if (value == null) memory.remove(key); else memory.put(key, value); });
                    // Android updates memory before the disk result. A failed commit need not roll back memory.
                    if (failNextCommit) { failNextCommit = false; return false; }
                    durable.clear(); durable.putAll(memory); return true;
                }
            }
        }
    }

    static final class Assets extends AssetManager {
        byte[] config;
        int opened, closed;
        OpenHook beforeOpen;
        IOException openFailure;
        Assets(String content) { config = content == null ? null : content.getBytes(StandardCharsets.UTF_8); }
        @Override public synchronized InputStream open(String name) throws IOException {
            equal(name, "refill-bootstrap.json", "only the named private asset is requested");
            opened++;
            if (beforeOpen != null) { OpenHook hook = beforeOpen; beforeOpen = null; hook.run(); }
            if (openFailure != null) throw openFailure;
            if (config == null) throw new FileNotFoundException(name);
            return new ByteArrayInputStream(config) {
                @Override public void close() throws IOException { super.close(); synchronized (Assets.this) { closed++; } }
            };
        }
    }
    static final class AppContext extends Context {
        final Device device;
        final String packageName;
        final Assets assets;
        AppContext(Device device, String packageName, Assets assets) { this.device = device; this.packageName = packageName; this.assets = assets; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            equal(mode, Context.MODE_PRIVATE, "preferences stay private");
            equal(name, "refill", "existing preference name is retained");
            return device.preferences(packageName, name);
        }
        @Override public AssetManager getAssets() { return assets; }
        MemoryPreferences preferences() { return device.preferences(packageName, "refill"); }
    }

    private static String config(String token, String endpoint, int format) {
        return new Gson().toJson(Map.of("format", format, "token", token, "endpoint", endpoint));
    }
    private static Assets validAssets() { return new Assets(config(DUMMY_A, BuildConfig.ENDPOINT, 1)); }
    private static AppContext fresh(Device device, Assets assets) { return new AppContext(device, FAST_PACKAGE, assets); }
    private static void untouched(RefillStore store, Device device) {
        equal(store.token(), "", "failure leaves registration empty before any commit");
        check(!store.bootstrapConsumed(), "failure does not consume the preset");
        check(device.durable(FAST_PACKAGE).isEmpty(), "failure writes no durable state");
    }

    public static void main(String[] args) throws Exception {
        test("missing asset preserves manual registration fallback", () -> {
            Device device = new Device(); AppContext context = fresh(device, new Assets(null));
            RefillStore store = new RefillStore(context);
            check(!RefillBootstrap.apply(context, store), "missing asset is an ordinary non-preset build");
            untouched(store, device);
            equal(context.preferences().commits, 0, "missing asset does not write");
        });
        test("first import persists token and requested initial settings together", () -> {
            Device device = new Device(); AppContext context = fresh(device, validAssets());
            RefillStore store = new RefillStore(context);
            check(RefillBootstrap.apply(context, store), "valid preset applies");
            equal(store.token(), DUMMY_A, "synthetic worker token stored");
            equal(store.endpoint(), BuildConfig.ENDPOINT, "only the configured endpoint stored");
            check(store.bootstrapConsumed(), "one-time marker stored");
            check(!store.enabled(), "background refill starts off");
            check(store.maximumPerformance(), "maximum performance defaults on");
            equal(store.vaultTarget(), 10, "stock target defaults to ten per condition");
            check(!store.meteredAllowed(), "metered data stays off");
            check(!store.notificationsAsked(), "notification permission is not pre-granted");
            check(store.updated() > 0, "preset has an update timestamp");
            equal(context.preferences().commits, 1, "registration, flags and settings share one commit");
            equal(context.assets.closed, 1, "asset stream closed");
        });
        test("repeat launch and process restart preserve user changes", () -> {
            Device device = new Device(); Assets assets = validAssets(); AppContext context = fresh(device, assets);
            RefillStore store = new RefillStore(context); check(RefillBootstrap.apply(context, store), "initial import");
            store.vaultTarget(100); store.maximumPerformance(false); store.enabled(true);
            check(!RefillBootstrap.apply(context, store), "same-process reapply skipped");
            equal(assets.opened, 1, "consumed preset is not reopened");
            device.restart(FAST_PACKAGE);
            RefillStore after = new RefillStore(fresh(device, assets));
            check(!RefillBootstrap.apply(fresh(device, assets), after), "restart reapply skipped");
            equal(after.vaultTarget(), 100, "custom stock target preserved");
            check(!after.maximumPerformance(), "changed performance setting preserved");
            check(after.enabled(), "user-enabled background work preserved");
            equal(after.token(), DUMMY_A, "registration persists across process restart");
        });
        test("existing manual registration and pending work are never overwritten", () -> {
            Device device = new Device(); AppContext context = fresh(device, validAssets());
            RefillStore store = new RefillStore(context);
            store.paired(DUMMY_B, "https://manual.invalid/api/vending/worker");
            store.vaultTarget(321); store.maximumPerformance(false);
            check(store.pending(DUMMY_B, new JSONObject().put("fixture", "existing-pending")), "pending fixture saved");
            Map<String, Object> before = device.durable(FAST_PACKAGE);
            check(!RefillBootstrap.apply(context, store), "existing token blocks preset");
            equal(device.durable(FAST_PACKAGE), before, "all existing state retained");
            equal(context.assets.opened, 0, "asset is not read when registered");
        });
        test("manual registration completed during asset read wins", () -> {
            Device device = new Device(); AppContext context = fresh(device, validAssets());
            RefillStore store = new RefillStore(context);
            context.assets.beforeOpen = () -> store.paired(DUMMY_B, BuildConfig.ENDPOINT);
            check(!RefillBootstrap.apply(context, store), "store repeats registration check after asset read");
            equal(store.token(), DUMMY_B, "manual token survives the race");
            check(store.enabled(), "manual registration settings retained");
            equal(store.vaultTarget(), 0, "preset settings did not override manual flow");
        });
        test("successful unpair prevents preset resurrection after restart", () -> {
            Device device = new Device(); Assets assets = validAssets(); AppContext context = fresh(device, assets);
            RefillStore store = new RefillStore(context); check(RefillBootstrap.apply(context, store), "initial import");
            store.unpair(); equal(store.token(), "", "unpair removes local token");
            check(store.bootstrapConsumed(), "unpair retains one-time marker");
            device.restart(FAST_PACKAGE); AppContext restarted = fresh(device, assets); RefillStore after = new RefillStore(restarted);
            check(!RefillBootstrap.apply(restarted, after), "restart cannot resurrect preset");
            equal(after.token(), "", "registration remains absent");
            equal(device.durable(FAST_PACKAGE), Map.of("bootstrapConsumed", true), "only suppression marker remains");
        });
        test("manual registration can still be used after unpair", () -> {
            Device device = new Device(); AppContext context = fresh(device, validAssets()); RefillStore store = new RefillStore(context);
            check(RefillBootstrap.apply(context, store), "initial import"); store.unpair();
            store.paired(DUMMY_B, BuildConfig.ENDPOINT);
            check(!RefillBootstrap.apply(context, store), "new manual registration remains authoritative");
            equal(store.token(), DUMMY_B, "manual re-registration succeeds");
            check(store.bootstrapConsumed(), "preset suppression remains set");
        });
        test("two application contexts preserve separate old and new preferences", () -> {
            Device device = new Device(); AppContext old = new AppContext(device, OLD_PACKAGE, new Assets(null));
            RefillStore oldStore = new RefillStore(old); oldStore.paired(DUMMY_B, BuildConfig.ENDPOINT); oldStore.vaultTarget(765);
            oldStore.pending(DUMMY_B, new JSONObject().put("fixture", "old-app-pending"));
            Map<String, Object> oldBefore = device.durable(OLD_PACKAGE);
            AppContext fast = fresh(device, validAssets()); RefillStore fastStore = new RefillStore(fast);
            check(RefillBootstrap.apply(fast, fastStore), "separate app gets its preset");
            equal(device.durable(OLD_PACKAGE), oldBefore, "old app registration/settings/pending unchanged");
            fastStore.unpair(); equal(device.durable(OLD_PACKAGE), oldBefore, "unpairing fast app leaves old app unchanged");
            equal(oldStore.vaultTarget(), 765, "old stock target retained");
        });
        test("bad, incomplete and oversized presets fail without durable writes", () -> {
            String[] invalid = {"{", "[]", "{}", config(DUMMY_A, BuildConfig.ENDPOINT, 2),
                    config("short", BuildConfig.ENDPOINT, 1), config("A".repeat(64), BuildConfig.ENDPOINT, 1),
                    config(DUMMY_A, "https://other.invalid/api/vending/worker", 1), " ".repeat(8193)};
            for (String source : invalid) {
                Device device = new Device(); AppContext context = fresh(device, new Assets(source)); RefillStore store = new RefillStore(context);
                fails(() -> RefillBootstrap.apply(context, store), "invalid preset must fail"); untouched(store, device);
                equal(context.assets.closed, 1, "invalid preset stream still closes");
            }
        });
        test("asset IO failure is reported and remains retryable", () -> {
            Device device = new Device(); AppContext context = fresh(device, validAssets()); RefillStore store = new RefillStore(context);
            context.assets.openFailure = new IOException("fixture read error");
            fails(() -> RefillBootstrap.apply(context, store), "read failure propagates"); untouched(store, device);
            context.assets.openFailure = null; check(RefillBootstrap.apply(context, store), "read error retry succeeds");
        });
        test("failed disk commit is reported and can retry after process restart", () -> {
            Device device = new Device(); Assets assets = validAssets(); AppContext context = fresh(device, assets); RefillStore store = new RefillStore(context);
            context.preferences().failNextCommit = true;
            fails(() -> RefillBootstrap.apply(context, store), "commit failure propagates");
            check(device.durable(FAST_PACKAGE).isEmpty(), "failed commit did not consume preset on disk");
            check(!store.enabled(), "even transient in-memory state keeps background work off");
            device.restart(FAST_PACKAGE); AppContext restarted = fresh(device, assets); RefillStore after = new RefillStore(restarted);
            check(RefillBootstrap.apply(restarted, after), "durable failure permits a clean retry");
            equal(after.token(), DUMMY_A, "successful retry stores the intended token");
        });
        test("two simultaneous preset imports accept only one credential", () -> {
            Device device = new Device(); AppContext context = fresh(device, validAssets()); RefillStore a = new RefillStore(context), b = new RefillStore(context);
            CountDownLatch start = new CountDownLatch(1); AtomicInteger accepted = new AtomicInteger(); AtomicReference<Throwable> error = new AtomicReference<>();
            Thread first = new Thread(() -> {try {start.await(); if (a.applyBootstrap(DUMMY_A, BuildConfig.ENDPOINT)) accepted.incrementAndGet();} catch (Throwable ex) {error.set(ex);}});
            Thread second = new Thread(() -> {try {start.await(); if (b.applyBootstrap(DUMMY_B, BuildConfig.ENDPOINT)) accepted.incrementAndGet();} catch (Throwable ex) {error.set(ex);}});
            first.start(); second.start(); start.countDown(); first.join(); second.join();
            check(error.get() == null, "concurrent imports complete without error"); equal(accepted.get(), 1, "one import wins");
            equal(context.preferences().commits, 1, "only one import commits");
            check(List.of(DUMMY_A, DUMMY_B).contains(a.token()), "stored credential is one complete input");
        });
        test("unpair wins a concurrent race against preset import", () -> {
            for (int n = 0; n < 12; n++) {
                Device device = new Device(); AppContext context = fresh(device, validAssets()); RefillStore store = new RefillStore(context);
                CountDownLatch start = new CountDownLatch(1); AtomicReference<Throwable> error = new AtomicReference<>();
                Thread importing = new Thread(() -> {try {start.await(); store.applyBootstrap(DUMMY_A, BuildConfig.ENDPOINT);} catch (Throwable ex) {error.set(ex);}});
                Thread unpairing = new Thread(() -> {try {start.await(); store.unpair();} catch (Throwable ex) {error.set(ex);}});
                importing.start(); unpairing.start(); start.countDown(); importing.join(); unpairing.join();
                check(error.get() == null, "concurrent operations complete"); equal(store.token(), "", "user unpair remains final");
                check(store.bootstrapConsumed(), "unpair suppression survives either ordering");
            }
        });
        Map<String, Object> result = new HashMap<>();
        result.put("ok", true); result.put("tests", passed.size()); result.put("assertions", assertions); result.put("passed", passed);
        result.put("scope", "Unmodified production RefillStore and RefillBootstrap; fake private SharedPreferences/AssetManager; Gson JSON adapter; synthetic endpoint and tokens only.");
        result.put("limitations", List.of("No Android runtime, UI or real SQLite installation test", "Android JSON parser and disk-failure implementation are not reproduced in full", "No network, administrator key, real worker token or production API accessed"));
        System.out.println(new Gson().toJson(result));
    }
}

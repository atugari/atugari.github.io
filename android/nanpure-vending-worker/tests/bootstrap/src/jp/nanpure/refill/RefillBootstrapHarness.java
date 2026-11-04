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
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Real Store/Bootstrap source, synthetic devices, and a controlled registration transport. */
public final class RefillBootstrapHarness {
    private static final String OLD_PACKAGE = "jp.nanpure.refill";
    private static final String FAST_PACKAGE = "jp.nanpure.refill.fast";
    private static final String SHARED_TOKEN = "a".repeat(64);
    private static final String MANUAL_TOKEN = "b".repeat(64);
    private static final String ENROLLMENT_KEY = "e".repeat(64);
    private static final String DEVICE_ID = "d".repeat(64);
    private static final String SHARED_HASH = hash(SHARED_TOKEN);
    private static final List<String> passed = new ArrayList<>();
    private static int assertions;

    @FunctionalInterface interface Checked { void run() throws Exception; }
    @FunctionalInterface interface OpenHook { void run() throws IOException; }
    private static synchronized void check(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }
    private static void equal(Object actual, Object expected, String message) {
        check(Objects.equals(actual, expected), message);
    }
    private static void fails(Checked action, String message) throws Exception {
        try { action.run(); }
        catch (IOException | JSONException expected) { check(true, message); return; }
        throw new AssertionError(message);
    }
    private static void test(String name, Checked body) throws Exception {
        try { body.run(); passed.add(name); }
        catch (Exception | AssertionError failure) { System.err.println("FAIL: " + name); throw failure; }
    }
    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(64);
            for (byte b : digest) out.append(Character.forDigit((b & 255) >>> 4, 16)).append(Character.forDigit(b & 15, 16));
            return out.toString();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

    /** Each Device has independent disk and process caches; restart discards memory. */
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
                    // Android can update memory even when its disk commit fails.
                    if (failNextCommit) { failNextCommit = false; return false; }
                    durable.clear(); durable.putAll(memory);
                    return true;
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
            equal(name, "refill-bootstrap.json", "only the private bootstrap asset is requested");
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
            equal(mode, Context.MODE_PRIVATE, "private preferences");
            equal(name, "refill", "existing preferences identity");
            return device.preferences(packageName, name);
        }
        @Override public AssetManager getAssets() { return assets; }
        MemoryPreferences preferences() { return device.preferences(packageName, "refill"); }
    }
    private static String preset() {
        return new Gson().toJson(Map.of("format", 2, "endpoint", BuildConfig.ENDPOINT,
                "enrollmentKey", ENROLLMENT_KEY, "legacyTokenSha256", SHARED_HASH));
    }
    private static RefillBootstrap.Config config() throws JSONException, IOException {
        return new RefillBootstrap.Config(new JSONObject(preset()));
    }
    private static AppContext fresh(Device device) { return new AppContext(device, FAST_PACKAGE, new Assets(preset())); }
    private static RefillStore.EnrollmentAttempt prepare(RefillStore store) throws IOException {
        return store.prepareEnrollment(BuildConfig.ENDPOINT, SHARED_HASH);
    }
    private static void assertPending(RefillStore store, RefillStore.EnrollmentAttempt attempt) {
        check(attempt != null, "an enrollment attempt exists");
        check(attempt.token.matches("[a-f0-9]{64}"), "candidate is a valid independent worker credential");
        check(!SHARED_TOKEN.equals(attempt.token) && !ENROLLMENT_KEY.equals(attempt.token), "candidate is not a bundled credential");
        check(store.registrationPending(), "pending state is visible");
        check(!store.registrationReady(), "work is gated while registration is pending");
        equal(store.pendingEnrollment().token, attempt.token, "pending token is stable");
        check(store.isCurrentEnrollment(attempt), "attempt identifies current enrollment");
    }
    private static void seedShared(AppContext context, boolean enabled) {
        context.preferences().edit().putString("token", SHARED_TOKEN).putString("endpoint", BuildConfig.ENDPOINT)
                .putBoolean("bootstrapConsumed", true).putBoolean("enabled", enabled)
                .putBoolean("maximumPerformance", false).putBoolean("metered", true)
                .putBoolean("notificationsAsked", true).putInt("vaultTarget", 1000).putInt("vaultCursor", 17)
                .putInt("sent", 42).putLong("vaultCount", 87).putLong("vaultBytes", 54321)
                .putInt("vaultProfiles", 12).putLong("updated", 123).putString("status", "fixture existing work")
                .commit();
    }
    private static void assertUserSettings(RefillStore store, boolean enabled) {
        equal(store.enabled(), enabled, "automatic refill choice retained");
        check(!store.maximumPerformance(), "performance choice retained");
        check(store.meteredAllowed(), "metered network choice retained");
        check(store.notificationsAsked(), "notification prompt choice retained");
        equal(store.vaultTarget(), 1000, "stock target retained");
        equal(store.vaultCursor(), 17, "stock cursor retained");
        equal(store.sent(), 42, "sent count retained");
        equal(store.vaultCount(), 87L, "stock count retained");
        equal(store.vaultBytes(), 54321L, "stock byte summary retained");
        equal(store.vaultProfiles(), 12, "stock profile summary retained");
    }
    static final class Server implements RefillBootstrap.Transport {
        final Map<String, String> devices = new HashMap<>();
        final AtomicInteger calls = new AtomicInteger();
        @Override public synchronized JSONObject call(String endpoint, JSONObject request) throws JSONException {
            calls.incrementAndGet();
            check(!RefillRunner.registrationLockHeldForTest(), "HTTP is outside the runner registration lock");
            equal(endpoint, BuildConfig.ENDPOINT, "HTTP uses the pinned endpoint");
            equal(request.getString("action"), "enroll", "request uses the restricted enrollment action");
            equal(request.getString("enrollmentKey"), ENROLLMENT_KEY, "request uses the enrollment key");
            String token = request.getString("token");
            check(token.matches("[a-f0-9]{64}"), "HTTP candidate format");
            check(!SHARED_TOKEN.equals(token), "HTTP never reuses the shared worker credential");
            String id = devices.computeIfAbsent(token, ignored -> String.format("%064x", devices.size() + 1));
            return new JSONObject().put("ok", true).put("id", id);
        }
    }
    private static boolean enroll(RefillStore store, RefillStore.EnrollmentAttempt attempt,
                                  RefillBootstrap.Transport transport) throws Exception {
        return RefillBootstrap.enroll(store, config(), attempt, "Synthetic test phone", transport);
    }
    private static Thread thread(Checked action, AtomicReference<Throwable> error) {
        return new Thread(() -> { try { action.run(); } catch (Throwable failure) { error.compareAndSet(null, failure); } });
    }
    private static void join(Thread... threads) throws InterruptedException {
        for (Thread thread : threads) {
            thread.join(10_000);
            check(!thread.isAlive(), "test operation completes without deadlock");
        }
    }
    private static void await(CountDownLatch latch) throws IOException {
        try { if (!latch.await(5, TimeUnit.SECONDS)) throw new IOException("test barrier timeout"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IOException(error); }
    }

    public static void main(String[] args) throws Exception {
        test("missing asset retains the manual registration fallback", () -> {
            Device device = new Device();
            AppContext context = new AppContext(device, FAST_PACKAGE, new Assets(null));
            RefillStore store = new RefillStore(context);
            check(!RefillBootstrap.apply(context, store), "no embedded enrollment configuration");
            check(device.durable(FAST_PACKAGE).isEmpty(), "missing asset does not write registration state");
            check(!store.registrationReady() && !store.registrationPending(), "neither registered nor pending");
        });
        test("two phones receive different credentials from the same APK", () -> {
            Device firstDevice = new Device(), secondDevice = new Device();
            AppContext firstContext = fresh(firstDevice), secondContext = fresh(secondDevice);
            RefillStore first = new RefillStore(firstContext), second = new RefillStore(secondContext);
            RefillBootstrap.apply(firstContext, first);
            RefillBootstrap.apply(secondContext, second);
            RefillStore.EnrollmentAttempt a = first.pendingEnrollment(), b = second.pendingEnrollment();
            assertPending(first, a); assertPending(second, b);
            check(!a.token.equals(b.token), "physical device contexts do not share the worker token");
            Server server = new Server();
            check(enroll(first, a, server), "first phone completes registration");
            check(enroll(second, b, server), "second phone completes registration");
            equal(server.devices.size(), 2, "two independent server identities");
            check(first.registrationReady() && second.registrationReady(), "both phones become ready");
            equal(first.token(), a.token, "first token unchanged by enrollment");
            equal(second.token(), b.token, "second token unchanged by enrollment");
            check(first.maximumPerformance() && second.maximumPerformance(), "fresh default maximum performance");
            equal(first.vaultTarget(), 10, "fresh stock default");
            check(!first.enabled() && !first.meteredAllowed(), "fresh automatic and metered work remain off");
        });
        test("candidate survives launch and process restart without changing", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt first = prepare(store);
            assertPending(store, first);
            RefillStore.EnrollmentAttempt again = prepare(new RefillStore(context));
            equal(again.token, first.token, "same-process retry reuses candidate");
            device.restart(FAST_PACKAGE);
            RefillStore restarted = new RefillStore(fresh(device));
            RefillStore.EnrollmentAttempt recovered = prepare(restarted);
            equal(recovered.token, first.token, "restart reads durable candidate");
            equal(recovered.generation, first.generation, "attempt generation survives restart");
            assertPending(restarted, recovered);
        });
        test("legacy shared registration migrates while preserving user settings", () -> {
            Device device = new Device(); AppContext context = fresh(device); seedShared(context, true);
            RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            assertPending(store, attempt);
            equal(attempt.previousToken, SHARED_TOKEN, "migration identifies only the old local credential");
            check(!attempt.fresh, "migration differs from a new installation");
            assertUserSettings(store, true);
            Server server = new Server(); check(enroll(store, attempt, server), "legacy migration completes");
            assertUserSettings(store, true);
            check(store.registrationReady(), "migrated registration ready");
            check(!SHARED_TOKEN.equals(store.token()), "shared token replaced");
            equal(server.devices.size(), 1, "migration adds one independent device");
        });
        test("manual registration remains untouched even when bootstrapConsumed is true", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            store.unpair(); store.paired(MANUAL_TOKEN, BuildConfig.ENDPOINT);
            store.vaultTarget(100); store.maximumPerformance(false);
            Map<String, Object> before = device.durable(FAST_PACKAGE);
            check(prepare(store) == null, "manual credential is not a migration candidate");
            RefillBootstrap.apply(context, store);
            equal(device.durable(FAST_PACKAGE), before, "manual settings are not rewritten");
            equal(store.token(), MANUAL_TOKEN, "manual worker retained");
            check(store.registrationReady(), "manual worker remains usable");
        });
        test("same old token at a different endpoint is not migrated", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            store.paired(SHARED_TOKEN, "https://other.invalid/api/vending/worker");
            Map<String, Object> before = device.durable(FAST_PACKAGE);
            check(prepare(store) == null, "different endpoint is not adopted");
            equal(device.durable(FAST_PACKAGE), before, "other server registration retained exactly");
        });
        test("manual registration completed while reading the asset wins", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            context.assets.beforeOpen = () -> store.paired(MANUAL_TOKEN, BuildConfig.ENDPOINT);
            RefillBootstrap.apply(context, store);
            equal(store.token(), MANUAL_TOKEN, "manual registration wins asset-read race");
            check(!store.registrationPending(), "automatic request not queued after manual registration");
        });
        test("explicit unpair remains an opt-out across restart and APK bootstrap", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            store.unpair();
            device.restart(FAST_PACKAGE);
            AppContext restartedContext = fresh(device); RefillStore restarted = new RefillStore(restartedContext);
            RefillBootstrap.apply(restartedContext, restarted);
            check(prepare(restarted) == null, "unpair prevents automatic registration");
            check(!restarted.registrationPending() && !restarted.registrationReady(), "unpaired remains unregistered");
            equal(restarted.token(), "", "old credential never resurrects");
        });
        test("candidate persistence failure sends no request and retries the same candidate", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            context.preferences().failNextCommit = true;
            AtomicInteger calls = new AtomicInteger();
            fails(() -> {
                RefillStore.EnrollmentAttempt attempt = prepare(store);
                enroll(store, attempt, (endpoint, request) -> {
                    calls.incrementAndGet(); return new JSONObject().put("ok", true).put("id", DEVICE_ID);
                });
            }, "failed candidate commit propagates");
            equal(calls.get(), 0, "HTTP does not run after a failed candidate commit");
            check(device.durable(FAST_PACKAGE).isEmpty(), "failed candidate is not durable");
            check(!store.registrationReady(), "failed persistence does not permit work");
            RefillStore.EnrollmentAttempt pending = store.pendingEnrollment();
            check(pending != null, "failed in-memory candidate is retained for an explicit retry");
            RefillStore.EnrollmentAttempt retry = prepare(store);
            equal(retry.token, pending.token, "retry does not create another candidate");
            device.restart(FAST_PACKAGE);
            equal(prepare(new RefillStore(fresh(device))).token, retry.token, "successful retry is durable");
        });
        test("HTTP preflight recommit must succeed even for a remembered candidate", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            context.preferences().failNextCommit = true;
            Server server = new Server();
            fails(() -> enroll(store, attempt, server), "failed HTTP preflight commit propagates");
            equal(server.calls.get(), 0, "no HTTP without a confirmed durable candidate");
            check(!store.registrationReady(), "preflight failure leaves work gated");
            equal(prepare(store).token, attempt.token, "retry retains candidate");
        });
        test("lost registration response is retried without creating another device", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            Server server = new Server();
            fails(() -> enroll(store, attempt, (endpoint, request) -> {
                server.call(endpoint, request);
                throw new IOException("synthetic response loss");
            }), "lost response leaves retryable state");
            equal(server.devices.size(), 1, "server accepted exactly one identity");
            check(!store.registrationReady(), "client does not assume lost response success");
            device.restart(FAST_PACKAGE);
            RefillStore restarted = new RefillStore(fresh(device));
            RefillStore.EnrollmentAttempt retry = prepare(restarted);
            equal(retry.token, attempt.token, "restart retries the admitted identity");
            check(enroll(restarted, retry, server), "idempotent retry completes");
            equal(server.devices.size(), 1, "retry does not use another registration slot");
        });
        test("offline enrollment survives process restart and retries the same device before any refill work", () -> {
            for (boolean migrating : List.of(false, true)) {
                Device device = new Device(); AppContext context = fresh(device);
                if (migrating) seedShared(context, true);
                RefillStore store = new RefillStore(context);
                check(RefillBootstrap.apply(context, store), "startup prepares automatic enrollment");
                RefillStore.EnrollmentAttempt attempt = store.pendingEnrollment();
                AtomicInteger offlineCalls = new AtomicInteger();
                fails(() -> enroll(store, attempt, (endpoint, request) -> {
                    offlineCalls.incrementAndGet();
                    throw new IOException("synthetic offline transport");
                }), "offline request leaves registration pending");
                equal(offlineCalls.get(), 1, "the failed request uses one attempt");
                check(!store.registrationReady(), "old shared credential cannot start refill work while offline");
                device.restart(FAST_PACKAGE);
                AppContext jobContext = fresh(device); RefillStore jobStore = new RefillStore(jobContext);
                check(RefillBootstrap.apply(jobContext, jobStore), "a later background startup resumes the pending registration");
                RefillStore.EnrollmentAttempt resumed = jobStore.pendingEnrollment();
                equal(resumed.token, attempt.token, "background startup reuses the durable candidate");
                equal(resumed.generation, attempt.generation, "background startup keeps the same attempt generation");
                check(!jobStore.registrationReady(), "background startup stays fenced before the registration response");
                if (!migrating) check(!jobStore.enabled(), "first registration can resume before automatic refill is enabled");
                else equal(jobStore.token(), SHARED_TOKEN, "old shared identity remains stored but fenced");
                Server server = new Server();
                check(enroll(jobStore, resumed, server), "restored connectivity completes the original registration");
                equal(jobStore.token(), attempt.token, "work can start only with the individual admitted token");
                equal(server.devices.size(), 1, "recovery creates one server identity");
                if (migrating) assertUserSettings(jobStore, true);
            }
        });
        test("a stale background wake after unpair cannot restart an offline enrollment", () -> {
            for (boolean migrating : List.of(false, true)) {
                Device device = new Device(); AppContext context = fresh(device);
                if (migrating) seedShared(context, true);
                RefillStore store = new RefillStore(context);
                RefillStore.EnrollmentAttempt attempt = prepare(store);
                fails(() -> enroll(store, attempt, (endpoint, request) -> {
                    throw new IOException("synthetic offline transport");
                }), "offline attempt is pending before opt-out");
                store.unpair();
                device.restart(FAST_PACKAGE);
                AppContext jobContext = fresh(device); RefillStore jobStore = new RefillStore(jobContext);
                check(!RefillBootstrap.apply(jobContext, jobStore), "background startup respects durable opt-out");
                check(!jobStore.registrationPending() && !jobStore.registrationReady(), "neither enrollment nor refill restarts");
                Server server = new Server();
                check(!enroll(jobStore, attempt, server), "old scheduled attempt is cancelled before HTTP");
                equal(server.calls.get(), 0, "stale wake sends no registration request");
                equal(jobStore.token(), "", "unpaired device remains unpaired");
            }
        });
        test("final commit failure stays gated and recovers the admitted identity after restart", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store); Server server = new Server();
            fails(() -> enroll(store, attempt, (endpoint, request) -> {
                JSONObject response = server.call(endpoint, request);
                context.preferences().failNextCommit = true;
                return response;
            }), "final commit failure propagates");
            equal(server.devices.size(), 1, "registration did reach the server");
            check(!store.registrationReady(), "memory-only registration cannot start work");
            equal(store.pendingEnrollment().token, attempt.token, "failed result retains candidate snapshot");
            device.restart(FAST_PACKAGE);
            RefillStore restarted = new RefillStore(fresh(device));
            RefillStore.EnrollmentAttempt retry = prepare(restarted);
            equal(retry.token, attempt.token, "durable pending candidate recovers");
            check(enroll(restarted, retry, server), "recovered final commit succeeds");
            equal(server.devices.size(), 1, "final commit retry does not create another device");
        });
        test("failed snapshots do not mix two phone contexts", () -> {
            Device firstDevice = new Device(), secondDevice = new Device();
            AppContext firstContext = fresh(firstDevice), secondContext = fresh(secondDevice);
            RefillStore first = new RefillStore(firstContext), second = new RefillStore(secondContext);
            firstContext.preferences().failNextCommit = true;
            fails(() -> prepare(first), "first phone candidate commit fails");
            RefillStore.EnrollmentAttempt firstAttempt = first.pendingEnrollment(), secondAttempt = prepare(second);
            check(!firstAttempt.token.equals(secondAttempt.token), "failed state is keyed to its preferences identity");
            Server server = new Server(); check(enroll(second, secondAttempt, server), "second phone can finish independently");
            check(second.registrationReady() && !first.registrationReady(), "failure does not bleed into another phone");
            equal(prepare(first).token, firstAttempt.token, "first phone resumes its own candidate");
        });
        test("invalid server responses do not complete registration", () -> {
            for (String reply : List.of("{}", "{\"ok\":false,\"id\":\"" + DEVICE_ID + "\"}",
                    "{\"ok\":true}", "{\"ok\":true,\"id\":\"\"}", "{\"ok\":true,\"id\":123}")) {
                Device device = new Device(); RefillStore store = new RefillStore(fresh(device));
                RefillStore.EnrollmentAttempt attempt = prepare(store);
                fails(() -> enroll(store, attempt, (endpoint, request) -> new JSONObject(reply)), "invalid response is rejected");
                check(!store.registrationReady(), "invalid response never creates ready state");
                equal(prepare(store).token, attempt.token, "invalid response does not rotate the candidate");
            }
        });
        test("unpair during network registration wins over a late success", () -> {
            Device device = new Device(); RefillStore store = new RefillStore(fresh(device));
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            check(!enroll(store, attempt, (endpoint, request) -> {
                store.unpair();
                return new JSONObject().put("ok", true).put("id", DEVICE_ID);
            }), "cancelled result is not committed");
            equal(store.token(), "", "late response cannot restore a credential");
            check(!store.registrationPending() && !store.registrationReady(), "unpair remains final");
            device.restart(FAST_PACKAGE);
            check(prepare(new RefillStore(fresh(device))) == null, "opt-out remains durable");
        });
        test("manual registration during network registration wins over a late success", () -> {
            Device device = new Device(); RefillStore store = new RefillStore(fresh(device));
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            check(!enroll(store, attempt, (endpoint, request) -> {
                store.paired(MANUAL_TOKEN, BuildConfig.ENDPOINT);
                store.vaultTarget(100);
                return new JSONObject().put("ok", true).put("id", DEVICE_ID);
            }), "superseded result is ignored");
            equal(store.token(), MANUAL_TOKEN, "manual credential preserved");
            equal(store.vaultTarget(), 100, "late response does not reset user settings");
        });
        test("unpair also cancels a failed final-commit snapshot", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            fails(() -> enroll(store, attempt, (endpoint, request) -> {
                context.preferences().failNextCommit = true;
                return new JSONObject().put("ok", true).put("id", DEVICE_ID);
            }), "fixture final commit fails");
            store.unpair();
            check(store.pendingEnrollment() == null, "unpair removes the retry snapshot");
            check(prepare(store) == null, "failed snapshot cannot bypass explicit unpair");
            check(!store.registrationReady(), "work stays disabled");
        });
        test("legacy delivery must be preserved and cleared before enrollment can finish", () -> {
            Device device = new Device(); AppContext context = fresh(device); seedShared(context, true);
            RefillStore store = new RefillStore(context);
            JSONObject legacy = new JSONObject().put("id", "old-shared-job").put("lease", "old-shared-lease")
                    .put("p", new JSONObject().put("fixture", "completed board"));
            check(store.pending(SHARED_TOKEN, legacy), "old completed payload is persisted");
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            Server server = new Server();
            fails(() -> enroll(store, attempt, server), "uncleared legacy delivery blocks final commit");
            equal(store.pending().toString(), legacy.toString(), "refused completion retains the legacy payload and lease");
            check(!store.registrationReady(), "work remains fenced until stock migration");
            check(!store.clearPending(attempt.token, false), "new candidate cannot clear old owner's legacy delivery");
            check(store.clearPending(SHARED_TOKEN, false), "old owner can clear only after the board has been preserved");
            check(enroll(store, attempt, server), "same admitted identity can finish after migration");
            equal(server.devices.size(), 1, "migration retry consumes one identity");
            check(store.pending() == null, "old job and lease never become the new worker's pending delivery");
            assertUserSettings(store, true);
        });
        test("status updates after a failed final commit keep the same durable pending migration", () -> {
            Device device = new Device(); AppContext context = fresh(device); seedShared(context, true);
            RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store); Server server = new Server();
            fails(() -> enroll(store, attempt, (endpoint, request) -> {
                JSONObject response = server.call(endpoint, request);
                context.preferences().failNextCommit = true;
                return response;
            }), "final migration commit fails");
            store.enrollmentStatus(attempt, "synthetic retry message");
            equal(context.preferences().getString("token", ""), SHARED_TOKEN, "memory remains on the fenced old token");
            check(context.preferences().getBoolean("enrollmentPending", false), "ordinary edits cannot flush a ready state");
            device.restart(FAST_PACKAGE);
            RefillStore restarted = new RefillStore(fresh(device));
            check(!restarted.registrationReady(), "restarted worker remains fenced");
            RefillStore.EnrollmentAttempt retry = prepare(restarted);
            equal(retry.token, attempt.token, "status persistence retains the same candidate");
            check(enroll(restarted, retry, server), "same candidate recovers without a new slot");
            equal(server.devices.size(), 1, "only the original admitted device exists");
            assertUserSettings(restarted, true);
        });
        test("stale worker status and forbidden responses cannot alter the new registration", () -> {
            Device device = new Device(); AppContext context = fresh(device); seedShared(context, true);
            RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store);
            String preparing = store.status();
            store.status(SHARED_TOKEN, BuildConfig.ENDPOINT, "old worker status during enrollment");
            store.status("unscoped old status during enrollment");
            check(!store.registrationRejected(SHARED_TOKEN, BuildConfig.ENDPOINT), "old 403 is ignored during migration");
            equal(store.status(), preparing, "pending registration status is retained");
            check(store.enabled(), "old 403 cannot disable the user's automatic refill choice");
            check(enroll(store, attempt, new Server()), "registration finishes");
            String completed = store.status();
            store.status(SHARED_TOKEN, BuildConfig.ENDPOINT, "late old worker status");
            check(!store.registrationRejected(SHARED_TOKEN, BuildConfig.ENDPOINT), "late old 403 is rejected");
            store.status(attempt.token, "https://other.invalid/api/vending/worker", "wrong endpoint status");
            check(!store.registrationRejected(attempt.token, "https://other.invalid/api/vending/worker"), "other endpoint cannot disable work");
            equal(store.status(), completed, "only current registration can replace status");
            check(store.enabled(), "new registration keeps the enabled preference");
            store.status(attempt.token, BuildConfig.ENDPOINT, "current worker status");
            equal(store.status(), "current worker status", "current worker status remains functional");
            check(store.registrationRejected(attempt.token, BuildConfig.ENDPOINT), "current worker rejection still applies");
            check(!store.enabled(), "actual current rejection disables automatic retries");
        });
        test("concurrent first launches converge on one durable candidate", () -> {
            Device device = new Device(); AppContext context = fresh(device);
            RefillStore first = new RefillStore(context), second = new RefillStore(context);
            CountDownLatch start = new CountDownLatch(1);
            AtomicReference<RefillStore.EnrollmentAttempt> a = new AtomicReference<>(), b = new AtomicReference<>();
            AtomicReference<Throwable> error = new AtomicReference<>();
            Thread one = thread(() -> { await(start); a.set(prepare(first)); }, error);
            Thread two = thread(() -> { await(start); b.set(prepare(second)); }, error);
            one.start(); two.start(); start.countDown(); join(one, two);
            check(error.get() == null, "concurrent prepare has no error");
            equal(a.get().token, b.get().token, "concurrent prepare chooses one identity");
            equal(a.get().generation, b.get().generation, "concurrent prepare shares one attempt generation");
            device.restart(FAST_PACKAGE);
            equal(prepare(new RefillStore(fresh(device))).token, a.get().token, "winning candidate persists");
        });
        test("concurrent HTTP completions register only the shared candidate", () -> {
            Device device = new Device(); AppContext context = fresh(device);
            RefillStore first = new RefillStore(context), second = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(first);
            CountDownLatch inRequest = new CountDownLatch(2);
            Server server = new Server();
            RefillBootstrap.Transport transport = (endpoint, request) -> {
                inRequest.countDown(); await(inRequest);
                return server.call(endpoint, request);
            };
            AtomicReference<Throwable> error = new AtomicReference<>();
            Thread one = thread(() -> enroll(first, attempt, transport), error);
            Thread two = thread(() -> enroll(second, attempt, transport), error);
            one.start(); two.start(); join(one, two);
            check(error.get() == null, "concurrent completion has no error");
            equal(server.devices.size(), 1, "same candidate consumes one server identity");
            equal(first.token(), attempt.token, "final credential is the admitted candidate");
            check(first.registrationReady() && !first.registrationPending(), "one complete ready state");
        });
        test("a consumed attempt cannot send another registration request", () -> {
            Device device = new Device(); RefillStore store = new RefillStore(fresh(device));
            RefillStore.EnrollmentAttempt attempt = prepare(store); Server server = new Server();
            check(enroll(store, attempt, server), "first completion succeeds");
            int calls = server.calls.get();
            enroll(store, attempt, server);
            equal(server.calls.get(), calls, "completed attempt does not repeat HTTP");
            check(prepare(store) == null, "completed automatic registration is stable");
        });
        test("completed registration and custom settings survive later launches", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            RefillStore.EnrollmentAttempt attempt = prepare(store); enroll(store, attempt, new Server());
            store.vaultTarget(1000); store.maximumPerformance(false); store.meteredAllowed(true); store.enabled(true);
            Map<String, Object> before = device.durable(FAST_PACKAGE);
            device.restart(FAST_PACKAGE);
            AppContext restartedContext = fresh(device); RefillStore restarted = new RefillStore(restartedContext);
            RefillBootstrap.apply(restartedContext, restarted);
            equal(device.durable(FAST_PACKAGE), before, "relaunch does not reapply defaults or enroll again");
            equal(restarted.token(), attempt.token, "registered identity persists");
            check(restarted.registrationReady(), "restarted device remains ready");
        });
        test("older application preferences remain unchanged", () -> {
            Device device = new Device();
            AppContext oldContext = new AppContext(device, OLD_PACKAGE, new Assets(null));
            RefillStore old = new RefillStore(oldContext); old.paired(MANUAL_TOKEN, BuildConfig.ENDPOINT); old.vaultTarget(100);
            Map<String, Object> before = device.durable(OLD_PACKAGE);
            RefillStore fast = new RefillStore(fresh(device)); RefillStore.EnrollmentAttempt attempt = prepare(fast);
            enroll(fast, attempt, new Server());
            equal(device.durable(OLD_PACKAGE), before, "separate app context untouched");
        });
        test("malformed, oversized and unexpected-field presets cause no durable state", () -> {
            List<String> invalid = List.of(
                    "{\"format\":1,\"endpoint\":\"" + BuildConfig.ENDPOINT + "\",\"token\":\"" + SHARED_TOKEN + "\"}",
                    preset().replace("\"format\":2", "\"format\":9"),
                    preset().replace(ENROLLMENT_KEY, "short"),
                    preset().replace(SHARED_HASH, "bad-hash"),
                    preset().replace(BuildConfig.ENDPOINT, "https://wrong.invalid/api/vending/worker"),
                    preset().substring(0, preset().length() - 1) + ",\"unexpected\":true}",
                    "{\"format\":2}",
                    "x".repeat(9000));
            for (String content : invalid) {
                Device device = new Device(); AppContext context = new AppContext(device, FAST_PACKAGE, new Assets(content));
                RefillStore store = new RefillStore(context);
                fails(() -> RefillBootstrap.apply(context, store), "invalid preset is rejected");
                check(device.durable(FAST_PACKAGE).isEmpty(), "invalid preset changes no durable state");
                check(!store.registrationReady() && !store.registrationPending(), "invalid preset does not enable work");
            }
        });
        test("asset IO failure can retry without consuming the configuration", () -> {
            Device device = new Device(); AppContext context = fresh(device); RefillStore store = new RefillStore(context);
            context.assets.openFailure = new IOException("synthetic asset failure");
            fails(() -> RefillBootstrap.apply(context, store), "asset error propagates");
            check(device.durable(FAST_PACKAGE).isEmpty(), "asset failure changes no durable state");
            context.assets.openFailure = null;
            RefillBootstrap.apply(context, store);
            assertPending(store, store.pendingEnrollment());
        });
        Map<String, Object> result = new HashMap<>();
        result.put("ok", true); result.put("tests", passed.size()); result.put("assertions", assertions); result.put("passed", passed);
        result.put("scope", "Production RefillStore and RefillBootstrap compiled unchanged; isolated synthetic device preferences; failed-disk-commit model; fake registration transport and runner lock; no real credentials.");
        result.put("limitations", List.of("No Android runtime, UI, Service or JobScheduler execution",
                "Android org.json and SharedPreferences implementations are adapted rather than reproduced in full",
                "Server quota/concurrency and SQLite vault migration are tested separately",
                "No network, administrator key, real enrollment/worker token or production API accessed"));
        System.out.println(new Gson().toJson(result));
    }
}

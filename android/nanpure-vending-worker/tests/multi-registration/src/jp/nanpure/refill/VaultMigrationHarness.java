package jp.nanpure.refill;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.database.sqlite.SQLiteDatabase;
import com.google.gson.Gson;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Runs the unchanged production Vault class with its real SQL, schema and triggers. */
public final class VaultMigrationHarness {
    private static final String OLD = "a".repeat(64);
    private static final String NEW = "b".repeat(64);
    private static final String PROFILE = "normal:9:18:0::::";
    private static final String PRIMARY = "https://primary.invalid/api/vending/worker";
    private static final String OTHER = "https://other.invalid/api/vending/worker";
    private static final String OLD_JOB = "1".repeat(64);
    private static final String NEW_JOB = "2".repeat(64);
    private static final List<String> passed = new ArrayList<>();
    private static int assertions;

    @FunctionalInterface interface Checked { void run() throws Exception; }
    private static void check(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }
    private static void equal(Object actual, Object expected, String message) {
        check(Objects.equals(actual, expected), message);
    }
    private static void test(String name, Checked action) throws Exception { action.run(); passed.add(name); }
    private static void fails(Checked action, String message) throws Exception {
        try { action.run(); }
        catch (RuntimeException expected) { check(true, message); return; }
        throw new AssertionError(message);
    }
    private static final class SpaceDirectory extends File {
        long available = 100_000_000_000L;
        SpaceDirectory(File path) { super(path.getAbsolutePath()); }
        @Override public long getUsableSpace() { return available; }
    }
    private static final class VaultContext extends Context {
        final File root;
        final SpaceDirectory files;
        VaultContext(File root) {
            this.root = root;
            root.mkdirs();
            files = new SpaceDirectory(new File(root, "files"));
            files.mkdirs();
        }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            throw new UnsupportedOperationException("Vault tests do not access preferences");
        }
        @Override public AssetManager getAssets() {
            throw new UnsupportedOperationException("Vault tests do not access private assets");
        }
        @Override public File getDatabasePath(String name) { return new File(root, name); }
        @Override public File getFilesDir() { return files; }
    }
    private static JSONObject puzzle(String uid, int marker) {
        JSONArray cells = new JSONArray();
        for (int i = 0; i < 81; i++) cells.put(i == 0 ? marker : 0);
        return new JSONObject().put("uid", uid).put("kind", "normal").put("n", 9).put("puzzle", cells);
    }
    private static JSONObject job(String id) {
        return new JSONObject().put("id", id).put("lease", "f".repeat(64));
    }
    private static void saved(RefillVault vault, String uid, int marker) throws Exception {
        equal(vault.save(PROFILE, puzzle(uid, marker)), RefillVault.Save.STORED, "fixture saved by production Vault");
    }

    public static void main(String[] args) throws Exception {
        VaultContext context = new VaultContext(new File(args[0]));
        boolean resume = args.length > 1 && "resume".equals(args[1]);
        try {
            if (resume) {
                test("migration persists across a fresh JVM and SQLite connection", () -> {
                    RefillVault vault = new RefillVault(context, PRIMARY);
                    equal(vault.count(), 3L, "all primary stock survives process restart");
                    equal(vault.count(PROFILE), 3L, "profile counts survive restart");
                    check(vault.pending(OLD, PRIMARY) == null, "old assignment stays removed");
                    RefillVault.Delivery fresh = vault.pending(NEW, PRIMARY);
                    check(fresh != null, "new independent assignment persists");
                    equal(fresh.request.getString("id"), NEW_JOB, "new lease identity persists");
                    equal(fresh.entry.puzzle.getString("uid"), "primary-1", "completed board payload persists");
                    equal(vault.sent(OLD, PRIMARY, 0), 7L, "old sent ledger unchanged");
                    equal(vault.sent(NEW, PRIMARY, 0), 7L, "new sent ledger retained");
                    RefillVault other = new RefillVault(context, OTHER);
                    equal(other.count(), 1L, "other endpoint stock persists");
                    check(other.pending(OLD, OTHER) != null, "other endpoint assignment persists");
                    RefillVault failed = new RefillVault(context, "https://failure.invalid/api/vending/worker");
                    equal(failed.count(), 2L, "stock remains after a failed-and-retried cleanup");
                    check(failed.pending(OLD, "https://failure.invalid/api/vending/worker") == null,
                            "successful cleanup retry is durable");
                });
            } else {
                RefillVault vault = new RefillVault(context, PRIMARY);
                RefillVault other = new RefillVault(context, OTHER);
                saved(vault, "primary-1", 1);
                saved(vault, "primary-2", 2);
                saved(vault, "primary-3", 3);
                saved(other, "other-1", 4);
                RefillVault.Entry primaryEntry = vault.first(PROFILE);
                vault.assign(OLD, PRIMARY, primaryEntry, job(OLD_JOB));
                other.assign(OLD, OTHER, other.first(PROFILE), job("3".repeat(64)));
                RefillVault.Delivery oldDelivery = vault.pending(OLD, PRIMARY);
                long bytesBefore = vault.bytes();
                Map<String, Long> countsBefore = vault.counts();
                String payloadBefore = primaryEntry.puzzle.toString();
                equal(vault.sent(OLD, PRIMARY, 7), 7L, "fixture sent ledger");

                test("registration cleanup keeps stock payloads counts and byte totals", () -> {
                    vault.releaseRegistration(OLD, PRIMARY);
                    check(vault.pending(OLD, PRIMARY) == null, "only old delivery is released");
                    equal(vault.count(), 3L, "completed puzzle count unchanged");
                    equal(vault.bytes(), bytesBefore, "compressed byte total unchanged");
                    equal(vault.counts(), countsBefore, "profile counts unchanged");
                    equal(vault.first(PROFILE).puzzle.toString(), payloadBefore, "old delivery board retained intact");
                    equal(vault.sent(OLD, PRIMARY, 0), 7L, "previous sent ledger retained");
                });
                test("cleanup is limited to its endpoint scope", () -> {
                    equal(other.count(), 1L, "other endpoint stock unchanged");
                    RefillVault.Delivery pending = other.pending(OLD, OTHER);
                    check(pending != null, "other endpoint old owner is still assigned");
                    equal(pending.entry.puzzle.getString("uid"), "other-1", "other endpoint payload unchanged");
                });
                test("new worker obtains a new job without reusing the old lease", () -> {
                    equal(vault.sent(NEW, PRIMARY, 7), 7L, "existing display count is carried into new ledger");
                    vault.assign(NEW, PRIMARY, vault.first(PROFILE), job(NEW_JOB));
                    RefillVault.Delivery pending = vault.pending(NEW, PRIMARY);
                    check(pending != null, "new owner assignment present");
                    equal(pending.request.getString("id"), NEW_JOB, "fresh job used for new worker");
                    check(!OLD_JOB.equals(pending.request.getString("id")), "old shared job never rebound");
                    equal(pending.entry.puzzle.toString(), payloadBefore, "finished board reused without regeneration");
                });
                test("late old acknowledgement cannot delete a new assignment or its board", () -> {
                    equal(vault.acknowledge(oldDelivery), 7L, "late old ack does not increment ledger");
                    equal(vault.count(), 3L, "late ack preserves all completed stock");
                    equal(vault.pending(NEW, PRIMARY).request.getString("id"), NEW_JOB,
                            "late ack cannot remove new worker delivery");
                    equal(vault.first(PROFILE).puzzle.toString(), payloadBefore, "late ack retains delivered board");
                });
                test("wrong owner is untouched and repeated old cleanup is idempotent", () -> {
                    String endpoint = "https://repeat.invalid/api/vending/worker";
                    RefillVault repeated = new RefillVault(context, endpoint);
                    saved(repeated, "repeat-1", 5);
                    repeated.assign(OLD, endpoint, repeated.first(PROFILE), job("4".repeat(64)));
                    repeated.releaseRegistration(NEW, endpoint);
                    check(repeated.pending(OLD, endpoint) != null, "different owner cannot clear old delivery");
                    repeated.releaseRegistration(OLD, endpoint);
                    repeated.releaseRegistration(OLD, endpoint);
                    check(repeated.pending(OLD, endpoint) == null, "repeat cleanup stays complete");
                    equal(repeated.count(), 1L, "idempotent cleanup keeps stock");
                });
                test("invalid requested endpoint cannot clear a delivery", () -> {
                    String endpoint = "https://validation.invalid/api/vending/worker";
                    RefillVault guarded = new RefillVault(context, endpoint);
                    saved(guarded, "validation-1", 6);
                    guarded.assign(OLD, endpoint, guarded.first(PROFILE), job("5".repeat(64)));
                    fails(() -> guarded.releaseRegistration(OLD, OTHER), "endpoint mismatch rejected");
                    check(guarded.pending(OLD, endpoint) != null, "mismatch leaves delivery intact");
                    equal(guarded.count(), 1L, "mismatch leaves stock intact");
                });
                test("SQLite cleanup failure preserves data and can retry safely", () -> {
                    String endpoint = "https://failure.invalid/api/vending/worker";
                    RefillVault guarded = new RefillVault(context, endpoint);
                    saved(guarded, "failure-1", 7);
                    saved(guarded, "failure-2", 8);
                    guarded.assign(OLD, endpoint, guarded.first(PROFILE), job("6".repeat(64)));
                    long before = guarded.bytes();
                    SQLiteDatabase.lastOpenedForTest().failNextForTest("DELETE FROM vault_deliveries",
                            "database or disk is full");
                    fails(() -> guarded.releaseRegistration(OLD, endpoint), "SQLite failure propagates");
                    check(guarded.pending(OLD, endpoint) != null, "failed cleanup leaves delivery intact");
                    equal(guarded.count(), 2L, "failed cleanup leaves stock intact");
                    equal(guarded.bytes(), before, "failed cleanup leaves byte accounting intact");
                    guarded.releaseRegistration(OLD, endpoint);
                    check(guarded.pending(OLD, endpoint) == null, "retry releases only the delivery");
                    equal(guarded.count(), 2L, "successful retry retains stock");
                });
            }
            Map<String, Object> result = Map.of("ok", true, "tests", passed.size(), "assertions", assertions,
                    "passed", passed, "scope", "Unmodified production RefillVault against a temporary real SQLite database via minimal Android test adapters.",
                    "limitations", List.of("No Android SQLite implementation or device installation",
                            "Disk capacity and injected write errors are controlled fixtures",
                            "No network, registration API, real credentials or real app database accessed"));
            System.out.println(new Gson().toJson(result));
        } finally {
            SQLiteDatabase database = SQLiteDatabase.lastOpenedForTest();
            if (database != null) database.close();
        }
    }
}

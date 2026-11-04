package jp.nanpure.refill;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

final class RefillRunner {
    private static final ReentrantLock EXCLUSIVE = new ReentrantLock();
    private static final IntentFilter BATTERY_STATE = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
    private static final long IDLE_MS = 60_000;
    private static final long RETRY_MS = 30_000;
    private static final long RETRY_PROFILE_MS = 5 * 60_000;
    static final long NEXT_ROUND = 1;
    private static final int REMOTE_BURST = 2;
    private static volatile RefillRunner scheduled;

    private final Context context;
    private final RefillStore store;
    private final boolean foreground;
    private final Consumer<String> update;
    private final Map<String, Long> retryProfileAfter = new HashMap<>();
    private volatile boolean stopped;
    private RefillEngine engine;
    private long nextRemote;
    private long nextSummary;
    private long nextLocalStatus;
    private long nextCursorSave;
    private int localCursor = -1;
    private int remoteRounds;

    RefillRunner(Context context, boolean foreground, Consumer<String> update) {
        this.context = context;
        this.store = new RefillStore(context);
        this.foreground = foreground;
        this.update = update;
    }

    static void preemptScheduled() {
        RefillRunner running = scheduled;
        if (running != null) running.stop();
    }

    synchronized void stop() {
        stopped = true;
        closeEngine();
    }

    boolean ready(Network network) {
        return canWork(store.token()) && (store.vaultTarget() > 0 || canSend(network));
    }

    long execute(Network network) throws IOException, JSONException, InterruptedException {
        if (foreground) EXCLUSIVE.lockInterruptibly();
        else if (!EXCLUSIVE.tryLock()) return 0;
        try {
            if (!foreground) {
                scheduled = this;
                if (RefillService.isRunning()) return 0;
            }
            return refill(network);
        } finally {
            if (!foreground) scheduled = null;
            EXCLUSIVE.unlock();
        }
    }

    private long refill(Network network) throws IOException, JSONException, InterruptedException {
        String token = store.token();
        if (!canWork(token)) return 0;
        int target = store.vaultTarget();
        boolean online = networkAllowed(network);
        if (!online && target == 0) {
            canSend(network);
            return 0;
        }
        String endpoint = store.endpoint();
        RefillVault vault = new RefillVault(context, endpoint);
        if (!migratePending(vault, token, endpoint)) return idle();
        long sent = vault.sent(token, endpoint, store.sent());
        Map<String, Long> counts = vault.counts();
        summarize(vault, token, counts, sent, false);

        boolean due = online && SystemClock.elapsedRealtime() >= nextRemote;
        if (due && (target == 0 || remoteRounds < REMOTE_BURST || vault.pending(token, endpoint) != null)) {
            if (tryRemote(network, vault, token, endpoint, counts)) return NEXT_ROUND;
        }
        if (target > 0 && canWork(token) && makeStock(vault, token, counts, target, sent)) {
            remoteRounds = 0;
            return NEXT_ROUND;
        }
        if (due && remoteRounds >= REMOTE_BURST && canWork(token)) {
            remoteRounds = 0;
            if (SystemClock.elapsedRealtime() >= nextRemote && tryRemote(network, vault, token, endpoint, counts)) {
                return NEXT_ROUND;
            }
        }
        if (!online) status("許可した回線につながり次第、補充の依頼を確認します");
        summarize(vault, token, counts, sent, true);
        return idle();
    }

    private boolean migratePending(RefillVault vault, String token, String endpoint)
            throws IOException, JSONException {
        JSONObject legacy = store.pending();
        if (legacy == null) return true;
        JSONObject puzzle = legacy.getJSONObject("p");
        String profile = RefillProfiles.PILOT_KEY;
        RefillVault.Entry entry = vault.find(profile, puzzle);
        if (entry == null) {
            if (vault.save(profile, puzzle) == RefillVault.Save.NO_SPACE) {
                status("空き容量が不足しています・送信待ちの問題は保持中");
                return false;
            }
            entry = vault.find(profile, puzzle);
        }
        if (entry != null && legacy.has("id") && vault.pending(token, endpoint) == null) {
            vault.assign(token, endpoint, entry, legacy);
        }
        return store.clearPending(token, false);
    }

    private boolean tryRemote(Network network, RefillVault vault, String token, String endpoint,
            Map<String, Long> counts) throws IOException, JSONException, InterruptedException {
        if (!canWork(token) || !networkAllowed(network)) return false;
        RefillApi api = new RefillApi(network, endpoint);
        try {
            RefillVault.Delivery pending = vault.pending(token, endpoint);
            if (pending != null) {
                remoteRounds++;
                send(api, network, vault, token, endpoint, pending);
                return true;
            }
            if (foreground) status("補充の依頼を確認中");
            JSONArray ready = new JSONArray();
            for (Map.Entry<String, Long> entry : counts.entrySet()) {
                if (entry.getValue() > 0) ready.put(entry.getKey());
            }
            JSONObject stock = new JSONObject().put("count", vault.count()).put("bytes", vault.bytes());
            JSONObject job = api.call(token, RefillApi.action("poll").put("version", 2)
                    .put("ready", ready).put("stock", stock))
                    .optJSONObject("job");
            if (job == null) {
                nextRemote = SystemClock.elapsedRealtime() + IDLE_MS;
                status("補充の依頼を待っています");
                return false;
            }
            remoteRounds++;
            fillJob(api, network, vault, token, endpoint, job, counts);
            return true;
        } catch (RefillApi.HttpFailure error) {
            if (error.status == 403) throw error;
            nextRemote = SystemClock.elapsedRealtime() + RETRY_MS;
            status("サーバーの応答待ち・あとで再試行します");
            return false;
        } catch (IOException error) {
            nextRemote = SystemClock.elapsedRealtime() + RETRY_MS;
            status("通信または保存の状態を確認中・あとで再試行します");
            return false;
        }
    }

    private void fillJob(RefillApi api, Network network, RefillVault vault, String token, String endpoint,
            JSONObject job, Map<String, Long> counts) throws IOException, JSONException, InterruptedException {
        boolean assigned = false;
        try {
            RefillProfiles.Profile profile = profileForJob(job);
            if (profile == null) {
                nextRemote = SystemClock.elapsedRealtime() + RETRY_MS;
                status("この補充条件に対応する更新を待っています");
                return;
            }
            RefillVault.Entry entry = vault.first(profile.key);
            if (entry == null) {
                if (!vault.canStore()) {
                    status("空き容量を確保するまで新規生成を停止します");
                    nextRemote = SystemClock.elapsedRealtime() + IDLE_MS;
                    return;
                }
                JSONObject puzzle = generateOne(profile, token, true, network);
                if (puzzle == null) return;
                // A finished board survives a stop or a power change before upload.
                if (!token.equals(store.token())) return;
                RefillVault.Save saved = vault.save(profile.key, puzzle);
                if (saved == RefillVault.Save.NO_SPACE) {
                    status("空き容量を確保するまで新規生成を停止します");
                    nextRemote = SystemClock.elapsedRealtime() + IDLE_MS;
                    return;
                }
                if (saved == RefillVault.Save.STORED) {
                    counts.merge(profile.key, 1L, Long::sum);
                    summarize(vault, token, counts, vault.sent(token, endpoint, store.sent()), true);
                }
                entry = vault.first(profile.key);
                if (entry == null) return;
            }
            if (!canWork(token) || !networkAllowed(network)) return;
            vault.assign(token, endpoint, entry, job);
            assigned = true;
            RefillVault.Delivery delivery = vault.pending(token, endpoint);
            if (delivery == null) throw new IOException("Refill assignment was not saved");
            send(api, network, vault, token, endpoint, delivery);
        } finally {
            if (!assigned) release(api, network, token, job);
        }
    }

    private RefillProfiles.Profile profileForJob(JSONObject job) throws IOException {
        String key = job.optString("profile");
        if (key.isEmpty() && "normal".equals(job.optString("kind")) && job.optInt("n") == 9 &&
                job.optInt("level") == 18) key = RefillProfiles.PILOT_KEY;
        RefillProfiles.Profile profile = RefillProfiles.find(context, key);
        return profile != null && profile.kind.equals(job.optString("kind")) && profile.n == job.optInt("n") &&
                profile.level == job.optInt("level") && profile.complexity == job.optInt("complexity") &&
                profile.multiShape.equals(job.optString("multiShape")) &&
                profile.linkedShape.equals(job.optString("linkedShape")) ? profile : null;
    }

    private boolean makeStock(RefillVault vault, String token, Map<String, Long> counts, int target, long sent)
            throws IOException, JSONException, InterruptedException {
        List<RefillProfiles.Profile> profiles = RefillProfiles.load(context);
        if (profiles.isEmpty() || store.vaultTarget() == 0) return false;
        int selected = selectProfile(profiles, counts, target);
        if (selected < 0) {
            boolean filled = profiles.stream().allMatch(profile -> counts.getOrDefault(profile.key, 0L) >= target);
            status(filled ? "端末在庫の目標に到達・補充の依頼待ち" : "時間をおいて残りの条件を再探索します");
            return false;
        }
        if (!vault.canStore()) {
            status("空き容量を確保するまで端末在庫の生成を停止します");
            return false;
        }
        RefillProfiles.Profile profile = profiles.get(selected);
        localCursor = (selected + 1) % profiles.size();
        long now = SystemClock.elapsedRealtime();
        if (now >= nextCursorSave) {
            store.vaultCursor(token, localCursor);
            nextCursorSave = now + 1_000;
        }
        JSONObject puzzle = generateOne(profile, token, false, null);
        if (puzzle == null) {
            retryProfileAfter.put(profile.key, SystemClock.elapsedRealtime() + RETRY_PROFILE_MS);
            return true;
        }
        if (!token.equals(store.token())) return false;
        if (counts.getOrDefault(profile.key, 0L) >= store.vaultTarget()) return true;
        RefillVault.Save saved = vault.save(profile.key, puzzle);
        if (saved == RefillVault.Save.STORED) {
            counts.merge(profile.key, 1L, Long::sum);
            summarize(vault, token, counts, sent, !canWork(token));
        } else if (saved == RefillVault.Save.NO_SPACE) {
            status("空き容量を確保するまで端末在庫の生成を停止します");
            return false;
        } else {
            retryProfileAfter.put(profile.key, SystemClock.elapsedRealtime() + RETRY_PROFILE_MS);
        }
        return true;
    }

    private int selectProfile(List<RefillProfiles.Profile> profiles, Map<String, Long> counts, int target) {
        int selected = -1;
        long lowest = target;
        long now = SystemClock.elapsedRealtime();
        if (localCursor < 0) localCursor = Math.floorMod(store.vaultCursor(), profiles.size());
        int start = localCursor;
        for (int i = 0; i < profiles.size(); i++) {
            int index = (start + i) % profiles.size();
            String key = profiles.get(index).key;
            long count = counts.getOrDefault(key, 0L);
            if (count < lowest && retryProfileAfter.getOrDefault(key, 0L) <= now) {
                selected = index;
                lowest = count;
                if (lowest == 0) break;
            }
        }
        return selected;
    }

    private JSONObject generateOne(RefillProfiles.Profile profile, String token, boolean remote, Network network)
            throws InterruptedException {
        String condition = profile.n + "×" + profile.n + " Lv." + profile.level;
        long now = SystemClock.elapsedRealtime();
        if (remote || now >= nextLocalStatus) {
            status(RefillProfiles.PILOT_KEY.equals(profile.key) && remote ? "至高の条件に合う問題を探索中" :
                    (remote ? "補充用を探索中・" : "端末在庫用を探索中・") + condition);
            if (!remote) nextLocalStatus = now + 1_000;
        }
        int budget = remote || profile.n >= 36 || RefillProfiles.PILOT_KEY.equals(profile.key) ? 75_000 : 20_000;
        PowerManager.WakeLock wake = null;
        RefillEngine current = engineForRound();
        try {
            if (foreground) {
                PowerManager power = context.getSystemService(PowerManager.class);
                wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NanpureRefill:round");
                wake.setReferenceCounted(false);
                wake.acquire(budget + 26_000L);
            }
            JSONObject result = current.generate(profile.key, budget,
                    () -> canWork(token) && (store.vaultTarget() > 0 || (remote && canSend(network))));
            if (result.has("error")) closeEngine();
            return result.optJSONObject("puzzle");
        } catch (TimeoutException | IOException error) {
            closeEngine();
            return null;
        } catch (InterruptedException error) {
            closeEngine();
            if (!remote && store.vaultTarget() == 0 && canWork(token)) return null;
            throw error;
        } finally {
            if (wake != null && wake.isHeld()) wake.release();
        }
    }

    private synchronized RefillEngine engineForRound() throws InterruptedException {
        if (stopped) throw new InterruptedException("Refill stopped");
        if (engine == null) engine = new RefillEngine(context);
        return engine;
    }

    private synchronized void closeEngine() {
        if (engine != null) engine.cancel();
        engine = null;
    }

    private void send(RefillApi api, Network network, RefillVault vault, String token, String endpoint,
            RefillVault.Delivery delivery) throws IOException, JSONException {
        if (!canWork(token) || !networkAllowed(network)) return;
        status("完成品をサーバーへ送信中");
        try {
            api.call(token, delivery.request);
            long accepted = vault.acknowledge(delivery);
            summarize(vault, token, vault.counts(), accepted, true);
            status("補充しました");
        } catch (RefillApi.HttpFailure error) {
            String message;
            if (error.status == 400 || error.status == 413 ||
                    (error.status == 409 && "duplicate".equals(error.code))) {
                vault.discard(delivery.entry);
                message = "duplicate".equals(error.code) ? "重複した問題を除外しました" :
                        "検証を通らなかった問題を除外しました";
            } else if (error.status == 409 && ("lease_expired".equals(error.code) ||
                    "shelf_full".equals(error.code) || "already_finished".equals(error.code))) {
                vault.release(delivery);
                message = "完成品を保存済み・次の補充依頼待ち";
            } else {
                throw error;
            }
            nextRemote = SystemClock.elapsedRealtime() + RETRY_MS;
            release(api, network, token, delivery.request);
            summarize(vault, token, vault.counts(), vault.sent(token, endpoint, store.sent()), true);
            status(message);
        }
    }

    private void summarize(RefillVault vault, String token, Map<String, Long> counts, long sent, boolean force) {
        long now = SystemClock.elapsedRealtime();
        if (force || now >= nextSummary) {
            store.vaultSummary(token, vault.count(), vault.bytes(), counts.size(), sent);
            nextSummary = now + 1_000;
        }
    }

    private void release(RefillApi api, Network network, String token, JSONObject job) {
        if (!token.equals(store.token()) || !networkAllowed(network)) return;
        try {
            api.call(token, RefillApi.action("release").put("id", job.getString("id"))
                    .put("lease", job.getString("lease")));
        } catch (IOException | JSONException ignored) {
            // The server can reassign the work after the lease expires.
        }
    }

    private long idle() {
        closeEngine();
        if (!foreground) return 0;
        long untilRemote = nextRemote - SystemClock.elapsedRealtime();
        return untilRemote > 0 ? Math.max(1_000, Math.min(untilRemote, IDLE_MS)) : IDLE_MS;
    }

    private boolean canWork(String token) {
        if (stopped || token.isEmpty() || !token.equals(store.token()) ||
                (!foreground && (!store.enabled() || RefillService.isRunning()))) return false;
        if (!hasExternalPower()) {
            status("電源接続待ち");
            return false;
        }
        if (Build.VERSION.SDK_INT >= 29 && context.getSystemService(PowerManager.class).getCurrentThermalStatus()
                >= PowerManager.THERMAL_STATUS_SEVERE) {
            status("端末の温度が下がるまで待機");
            return false;
        }
        return true;
    }

    private boolean hasExternalPower() {
        Intent state = context.registerReceiver(null, BATTERY_STATE);
        return state != null && state.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) > 0;
    }

    private boolean canSend(Network network) {
        if (networkAllowed(network)) return true;
        status("許可した回線につながるまで待機");
        return false;
    }

    private boolean networkAllowed(Network network) {
        NetworkCapabilities capabilities = network == null ? null :
                context.getSystemService(ConnectivityManager.class).getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                && (store.meteredAllowed() || capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED));
    }

    private void status(String message) {
        if (!stopped && (foreground || !RefillService.isRunning())) update.accept(message);
    }
}

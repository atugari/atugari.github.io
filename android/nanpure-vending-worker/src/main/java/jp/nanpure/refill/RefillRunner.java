package jp.nanpure.refill;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

final class RefillRunner {
    private static final ReentrantLock EXCLUSIVE = new ReentrantLock();
    private static final int ROUND_MS = 75000;
    private static final long SESSION_MS = 4 * 60 * 1000;
    private static final long IDLE_MS = 60 * 1000;
    private static volatile RefillRunner scheduled;

    private final Context context;
    private final RefillStore store;
    private final boolean foreground;
    private final Consumer<String> update;
    private volatile boolean stopped;
    private boolean conditionLost;
    private volatile RefillEngine engine;

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

    void stop() {
        stopped = true;
        RefillEngine current = engine;
        if (current != null) current.cancel();
    }

    boolean ready(Network network) {
        return canWork(network, store.token());
    }

    long execute(Network network) throws IOException, JSONException, InterruptedException, TimeoutException {
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

    private long refill(Network network) throws IOException, JSONException, InterruptedException, TimeoutException {
        String token = store.token();
        conditionLost = false;
        if (!canWork(network, token)) return 0;
        RefillApi api = new RefillApi(network, store.endpoint());
        long start = SystemClock.elapsedRealtime();
        JSONObject pending = store.pending();
        JSONObject job = null;
        try {
            if (pending != null && pending.has("id")) {
                send(api, token, pending);
                pending = store.pending();
            }
            while (canWork(network, token) && SystemClock.elapsedRealtime() - start < SESSION_MS - ROUND_MS - 30000) {
                if (foreground) status("補充の依頼を確認中");
                job = api.call(token, RefillApi.action("poll")).optJSONObject("job");
                if (job == null) {
                    status(pending == null ? "補充の依頼を待っています" : "完成品を保存済み・次の依頼待ち");
                    return foreground ? IDLE_MS : 0;
                }
                if (!"normal".equals(job.optString("kind")) || job.optInt("n") != 9 || job.optInt("level") != 18) {
                    throw new IOException("Unexpected refill condition");
                }
                if (!canWork(network, token)) return 0;
                JSONObject puzzle = pending == null ? null : pending.optJSONObject("p");
                if (puzzle == null) {
                    status("至高の条件に合う問題を探索中");
                    JSONObject answer = generate(network, token);
                    if (answer.optBoolean("exhausted")) continue;
                    puzzle = answer.optJSONObject("puzzle");
                    if (puzzle == null) throw new IOException("Refill engine did not return a puzzle");
                }
                pending = RefillApi.action("result").put("id", job.getString("id"))
                        .put("lease", job.getString("lease")).put("p", puzzle);
                // Preserve a complete proof even when conditions change before transmission.
                if (!store.pending(token, pending)) return 0;
                if (!canWork(network, token)) return 0;
                send(api, token, pending);
                pending = store.pending();
            }
            return canWork(network, token) ? (foreground ? 1 : 15000) : 0;
        } finally {
            if (foreground && job != null && (stopped || conditionLost) && token.equals(store.token())
                    && networkAllowed(network)) release(api, token, job);
        }
    }

    private JSONObject generate(Network network, String token)
            throws IOException, InterruptedException, TimeoutException {
        PowerManager.WakeLock wake = null;
        if (foreground) {
            PowerManager power = context.getSystemService(PowerManager.class);
            wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NanpureRefill:round");
            wake.setReferenceCounted(false);
            wake.acquire(ROUND_MS + 26000L);
        }
        RefillEngine current = new RefillEngine(context);
        engine = current;
        try {
            return current.generate(ROUND_MS, () -> canWork(network, token));
        } finally {
            engine = null;
            if (wake != null && wake.isHeld()) wake.release();
        }
    }

    private void send(RefillApi api, String token, JSONObject pending) throws IOException, JSONException {
        status("完成品をサーバーへ送信中");
        try {
            api.call(token, pending);
            if (store.clearPending(token, true)) status("補充しました");
        } catch (RefillApi.HttpFailure error) {
            if (!token.equals(store.token())) throw error;
            if (error.status == 400 || error.status == 413) {
                if (store.clearPending(token, false)) status("検証を通らなかった問題を除外しました");
                return;
            }
            if (error.status != 409) throw error;
            if ("lease_expired".equals(error.code) || "shelf_full".equals(error.code) ||
                    "already_finished".equals(error.code)) {
                if (store.pending(token, new JSONObject().put("p", pending.getJSONObject("p")))) {
                    status("完成品を保存済み・新しい依頼を確認中");
                }
            } else if ("duplicate".equals(error.code)) {
                if (store.clearPending(token, false)) status("重複した問題を除外しました");
            } else {
                throw error;
            }
        }
    }

    private void release(RefillApi api, String token, JSONObject job) {
        try {
            api.call(token, RefillApi.action("release").put("id", job.getString("id"))
                    .put("lease", job.getString("lease")));
        } catch (IOException | JSONException ignored) {
            // The server can reassign the work after the lease expires.
        }
    }

    private boolean canWork(Network network, String token) {
        if (stopped || token.isEmpty() || !token.equals(store.token()) ||
                (!foreground && (!store.enabled() || RefillService.isRunning()))) return false;
        BatteryManager battery = context.getSystemService(BatteryManager.class);
        if (!battery.isCharging()) {
            return blocked("充電待ち");
        }
        if (Build.VERSION.SDK_INT >= 29 && context.getSystemService(PowerManager.class).getCurrentThermalStatus()
                >= PowerManager.THERMAL_STATUS_SEVERE) {
            return blocked("端末の温度が下がるまで待機");
        }
        if (!networkAllowed(network)) return blocked("許可した回線につながるまで待機");
        return true;
    }

    private boolean networkAllowed(Network network) {
        NetworkCapabilities capabilities = network == null ? null :
                context.getSystemService(ConnectivityManager.class).getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                && (store.meteredAllowed() || capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED));
    }

    private boolean blocked(String message) {
        conditionLost = true;
        status(message);
        return false;
    }

    private void status(String message) {
        if (!stopped && (foreground || !RefillService.isRunning())) update.accept(message);
    }
}

package jp.nanpure.refill;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeoutException;

public final class RefillJob extends JobService {
    private static final int PERIODIC = 5180;
    private static final int CHECK = 5181;
    private static final long QUARTER_HOUR = 15 * 60 * 1000;
    private static final int ROUND_MS = 75000;
    private static final long SESSION_MS = 4 * 60 * 1000;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Run active;

    static void schedule(Context context, boolean replace) {
        RefillStore store = new RefillStore(context);
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (!store.enabled() || store.token().isEmpty()) {
            scheduler.cancel(PERIODIC);
            scheduler.cancel(CHECK);
            return;
        }
        if (replace) {
            scheduler.cancel(PERIODIC);
            scheduler.cancel(CHECK);
        }
        if (scheduler.getPendingJob(PERIODIC) == null) {
            int result = scheduler.schedule(base(context, PERIODIC, store)
                    .setPeriodic(QUARTER_HOUR).setPersisted(true).build());
            if (result != JobScheduler.RESULT_SUCCESS) store.status("自動補充を予約できませんでした");
        }
    }

    static void request(Context context, long delayMs) {
        RefillStore store = new RefillStore(context);
        if (!store.enabled() || store.token().isEmpty()) return;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler.getPendingJob(CHECK) != null) return;
        scheduler.schedule(base(context, CHECK, store).setMinimumLatency(delayMs).build());
    }

    private static JobInfo.Builder base(Context context, int id, RefillStore store) {
        return new JobInfo.Builder(id, new ComponentName(context, RefillJob.class))
                .setRequiredNetworkType(store.meteredAllowed()
                        ? JobInfo.NETWORK_TYPE_ANY : JobInfo.NETWORK_TYPE_UNMETERED)
                .setRequiresCharging(true);
    }

    @Override public boolean onStartJob(JobParameters parameters) {
        if (active != null) return false;
        Run run = new Run(parameters);
        active = run;
        run.thread.start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters parameters) {
        if (active == null || active.parameters.getJobId() != parameters.getJobId()) return true;
        active.stop();
        return true;
    }

    @Override public void onDestroy() {
        if (active != null) active.stop();
        super.onDestroy();
    }

    private final class Run implements Runnable {
        final JobParameters parameters;
        final Thread thread;
        final RefillStore store = new RefillStore(RefillJob.this);
        volatile boolean stopped;
        volatile RefillEngine engine;

        Run(JobParameters parameters) {
            this.parameters = parameters;
            thread = new Thread(this, "nanpure-refill");
        }

        void stop() {
            stopped = true;
            RefillEngine current = engine;
            if (current != null) current.cancel();
            thread.interrupt();
        }

        @Override public void run() {
            long followUp = 0;
            try {
                followUp = refill();
            } catch (RefillApi.HttpFailure error) {
                if (error.status == 403 && !stopped) {
                    store.enabled(false);
                    store.status("端末登録を確認してください");
                } else if (!stopped) {
                    store.status("サーバーの応答待ち・次の確認で再試行");
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            } catch (IOException | JSONException | TimeoutException | RuntimeException error) {
                if (!stopped) store.status("補充を中断しました・次の確認で再試行");
            } finally {
                long next = followUp;
                main.post(() -> {
                    if (active != this) return;
                    active = null;
                    if (stopped) {
                        if (store.enabled()) store.status("補充を中断・条件がそろい次第再開");
                        return;
                    }
                    jobFinished(parameters, false);
                    if (!store.enabled()) schedule(RefillJob.this, false);
                    if (next > 0) main.postDelayed(() -> request(RefillJob.this, next), 500);
                });
            }
        }

        private long refill() throws IOException, JSONException, InterruptedException, TimeoutException {
            String token = store.token();
            if (token.isEmpty() || !store.enabled()) return 0;
            ConnectivityManager manager = getSystemService(ConnectivityManager.class);
            Network network = Build.VERSION.SDK_INT >= 28 ? parameters.getNetwork() : manager.getActiveNetwork();
            if (network == null) network = manager.getActiveNetwork();
            if (!canWork(network, token)) return 0;
            RefillApi api = new RefillApi(network, store.endpoint());
            long start = SystemClock.elapsedRealtime();
            JSONObject pending = store.pending();
            if (pending != null && pending.has("id")) {
                send(api, token, pending);
                pending = store.pending();
            }

            while (canWork(network, token) && SystemClock.elapsedRealtime() - start < SESSION_MS - ROUND_MS - 30000) {
                JSONObject job = api.call(token, RefillApi.action("poll")).optJSONObject("job");
                if (job == null) {
                    store.status(pending == null ? "補充の依頼を待っています" : "完成品を保存済み・次の依頼待ち");
                    return 0;
                }
                if (!"normal".equals(job.optString("kind")) || job.optInt("n") != 9 || job.optInt("level") != 18) {
                    throw new IOException("Unexpected refill condition");
                }
                JSONObject puzzle = pending == null ? null : pending.optJSONObject("p");
                if (puzzle == null) {
                    store.status("至高の条件に合う問題を探索中");
                    engine = new RefillEngine(RefillJob.this);
                    JSONObject answer;
                    try {
                        answer = engine.generate(ROUND_MS);
                    } finally {
                        engine = null;
                    }
                    if (answer.optBoolean("exhausted")) continue;
                    puzzle = answer.optJSONObject("puzzle");
                    if (puzzle == null) throw new IOException("Refill engine did not return a puzzle");
                }
                pending = RefillApi.action("result").put("id", job.getString("id"))
                        .put("lease", job.getString("lease")).put("p", puzzle);
                // Persist the complete proof and exact request before the network call.
                if (!token.equals(store.token())) return 0;
                store.pending(pending);
                if (!canWork(network, token)) return 0;
                send(api, token, pending);
                pending = store.pending();
            }
            return canWork(network, token) ? 15000 : 0;
        }

        private void send(RefillApi api, String token, JSONObject pending)
                throws IOException, JSONException {
            store.status("完成品をサーバーへ送信中");
            try {
                api.call(token, pending);
                if (token.equals(store.token())) {
                    store.clearPending(true);
                    store.status("補充しました");
                }
            } catch (RefillApi.HttpFailure error) {
                if (!token.equals(store.token())) throw error;
                if (error.status == 400 || error.status == 413) {
                    store.clearPending(false);
                    store.status("検証を通らなかった問題を除外しました");
                    return;
                }
                if (error.status != 409) throw error;
                if ("lease_expired".equals(error.code) || "shelf_full".equals(error.code) ||
                        "already_finished".equals(error.code)) {
                    store.pending(new JSONObject().put("p", pending.getJSONObject("p")));
                    store.status("完成品を保存済み・新しい依頼を確認中");
                } else if ("duplicate".equals(error.code)) {
                    store.clearPending(false);
                    store.status("重複した問題を除外しました");
                } else {
                    throw error;
                }
            }
        }

        private boolean canWork(Network network, String token) {
            if (stopped || !store.enabled() || !token.equals(store.token())) return false;
            BatteryManager battery = getSystemService(BatteryManager.class);
            if (!battery.isCharging()) {
                store.status("充電待ち");
                return false;
            }
            if (Build.VERSION.SDK_INT >= 29 && getSystemService(PowerManager.class).getCurrentThermalStatus()
                    >= PowerManager.THERMAL_STATUS_SEVERE) {
                store.status("端末の温度が下がるまで待機");
                return false;
            }
            NetworkCapabilities capabilities = network == null ? null :
                    getSystemService(ConnectivityManager.class).getNetworkCapabilities(network);
            if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ||
                    (!store.meteredAllowed() && !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED))) {
                store.status("許可した回線につながるまで待機");
                return false;
            }
            return true;
        }
    }
}

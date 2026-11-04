package jp.nanpure.refill;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;

import java.io.IOException;
import java.util.concurrent.TimeoutException;

public final class RefillJob extends JobService {
    private static final int PERIODIC = 5180;
    private static final int CHECK = 5181;
    private static final long QUARTER_HOUR = 15 * 60 * 1000;
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
            if (result != JobScheduler.RESULT_SUCCESS && !RefillService.isRunning()) {
                store.status("自動補充を予約できませんでした");
            }
        }
    }

    static void request(Context context, long delayMs) {
        RefillStore store = new RefillStore(context);
        if (!store.enabled() || store.token().isEmpty() || RefillService.isRunning()) return;
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
        if (active != null || RefillService.isRunning()) return false;
        Run run = new Run(parameters);
        active = run;
        run.thread.start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters parameters) {
        if (active != null && active.parameters.getJobId() == parameters.getJobId()) active.stop();
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
        final RefillRunner runner = new RefillRunner(RefillJob.this, false, store::status);
        volatile boolean stopped;

        Run(JobParameters parameters) {
            this.parameters = parameters;
            thread = new Thread(this, "nanpure-refill");
        }

        void stop() {
            stopped = true;
            runner.stop();
            thread.interrupt();
        }

        private boolean report() {
            return !stopped && !RefillService.isRunning() && !store.token().isEmpty();
        }

        @Override public void run() {
            long followUp = 0;
            try {
                ConnectivityManager manager = getSystemService(ConnectivityManager.class);
                Network network = Build.VERSION.SDK_INT >= 28 ? parameters.getNetwork() : manager.getActiveNetwork();
                if (network == null) network = manager.getActiveNetwork();
                followUp = runner.execute(network);
            } catch (RefillApi.HttpFailure error) {
                if (report()) {
                    if (error.status == 403) {
                        store.enabled(false);
                        store.status("端末登録を確認してください");
                    } else {
                        store.status("サーバーの応答待ち・次の確認で再試行");
                    }
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            } catch (IOException | JSONException | TimeoutException | RuntimeException error) {
                if (report()) store.status("補充を中断しました・次の確認で再試行");
            } finally {
                long next = followUp;
                main.post(() -> {
                    if (active != this) return;
                    active = null;
                    if (stopped) {
                        if (!RefillService.isRunning() && store.enabled() && !store.token().isEmpty()) {
                            store.status("補充を中断・条件がそろい次第再開");
                        }
                        return;
                    }
                    jobFinished(parameters, false);
                    if (!store.enabled()) schedule(RefillJob.this, false);
                    if (next > 0) main.postDelayed(() -> request(RefillJob.this, next), 500);
                });
            }
        }
    }
}

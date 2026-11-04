package jp.nanpure.refill;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.List;

/** Coordinates automatic registration off the UI thread. No device token is ever rotated on retry. */
final class RefillEnrollment {
    private static final Object CONTROL = new Object();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static boolean running;
    private static long retryAt;
    private static int failures;
    private static RefillStore.EnrollmentAttempt lastAttempt;
    private static Runnable retry;
    private static final List<Runnable> completions = new ArrayList<>();

    private RefillEnrollment() {}

    static void request(Context context) {
        request(context, null);
    }

    static void request(Context context, Runnable completion) {
        Context app = context.getApplicationContext();
        RefillStore store = new RefillStore(app);
        RefillStore.EnrollmentAttempt attempt = store.pendingEnrollment();
        if (attempt == null) {
            if (completion != null) MAIN.post(completion);
            return;
        }
        synchronized (CONTROL) {
            if (running) {
                if (completion != null) completions.add(completion);
                return;
            }
            if (lastAttempt == null || lastAttempt.generation != attempt.generation ||
                    !lastAttempt.token.equals(attempt.token)) {
                lastAttempt = attempt;
                retryAt = 0;
                failures = 0;
            }
            if (SystemClock.elapsedRealtime() < retryAt) {
                if (completion != null) MAIN.post(completion);
                return;
            }
            if (retry != null) MAIN.removeCallbacks(retry);
            retry = null;
            if (completion != null) completions.add(completion);
            running = true;
        }
        new Thread(() -> run(app, store, attempt), "nanpure-enrollment").start();
    }

    private static void run(Context context, RefillStore store, RefillStore.EnrollmentAttempt attempt) {
        long delay = 30_000;
        try {
            RefillBootstrap.Config config = RefillBootstrap.load(context);
            if (config == null) {
                store.enrollmentStatus(attempt, "自動登録の設定がありません・アプリの更新を確認してください");
                delay = 5 * 60_000;
                return;
            }
            // First fence every generation/delivery path. The exclusive runner barrier
            // then lets an already in-flight request finish before local ownership changes.
            RefillRunner.preemptForRegistration();
            context.stopService(new Intent(context, RefillService.class));
            RefillJob.schedule(context, false);
            if (!RefillRunner.prepareEnrollmentStock(context, store, attempt)) return;
            Network network = allowedNetwork(context, store);
            if (network == null) {
                store.enrollmentStatus(attempt, "自動登録待ち・Wi-Fi または許可した回線につないでください");
                delay = 10_000;
                return;
            }
            String name = Build.MANUFACTURER + " " + Build.MODEL + " 高速版";
            if (RefillBootstrap.enroll(store, config, attempt, name,
                    (endpoint, request) -> new RefillApi(network, endpoint).call("", request))) {
                RefillJob.schedule(context, true);
                RefillJob.request(context, 0);
            }
            failures = 0;
        } catch (RefillApi.HttpFailure error) {
            if (error.status >= 400 && error.status < 500) {
                store.enrollmentStatus(attempt, enrollmentFailure(error.code));
                delay = 5 * 60_000;
            } else {
                store.enrollmentStatus(attempt, "自動登録待ち・サーバーへの接続を再試行します");
                delay = retryDelay();
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            store.enrollmentStatus(attempt, "自動登録待ち・あとで同じ登録を再試行します");
        } catch (Exception error) {
            // Never include a response, URL query, key or token in a displayed error.
            store.enrollmentStatus(attempt, "自動登録待ち・通信または端末の空き容量を確認してください");
            delay = retryDelay();
        } finally {
            List<Runnable> finished;
            synchronized (CONTROL) {
                running = false;
                if (store.isCurrentEnrollment(attempt)) {
                    retryAt = SystemClock.elapsedRealtime() + delay;
                    retry = () -> request(context);
                    MAIN.postDelayed(retry, delay);
                } else {
                    retryAt = 0;
                    lastAttempt = null;
                }
                finished = new ArrayList<>(completions);
                completions.clear();
            }
            for (Runnable completion : finished) MAIN.post(completion);
        }
    }

    private static long retryDelay() {
        failures = Math.min(4, failures + 1);
        return Math.min(60_000, 5_000L << (failures - 1));
    }

    private static Network allowedNetwork(Context context, RefillStore store) {
        ConnectivityManager connectivity = context.getSystemService(ConnectivityManager.class);
        Network network = connectivity == null ? null : connectivity.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : connectivity.getNetworkCapabilities(network);
        if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ||
                (!store.meteredAllowed() && !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED))) return null;
        return network;
    }

    private static String enrollmentFailure(String code) {
        if ("enrollment_full".equals(code) || "device_limit".equals(code)) {
            return "自動登録待ち・登録できるスマホの台数が上限に達しています";
        }
        if ("device_revoked".equals(code)) return "このスマホの登録は管理側で停止されています";
        if ("enrollment_revoked".equals(code) || "enrollment_expired".equals(code)) {
            return "自動登録の受付が停止しています・配布元に確認してください";
        }
        return "自動登録を確認できません・配布元に確認してください";
    }
}

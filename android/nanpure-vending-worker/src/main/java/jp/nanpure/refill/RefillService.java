package jp.nanpure.refill;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import org.json.JSONException;

import java.io.IOException;

public final class RefillService extends Service {
    private static final String STOP = "jp.nanpure.refill.STOP_CONTINUOUS";
    private static final String CHANNEL = "continuous_refill";
    private static final int NOTIFICATION = 5182;
    private static final long RETRY_MS = 30 * 1000;
    private static volatile boolean running;

    private final Handler main = new Handler(Looper.getMainLooper());
    private RefillStore store;
    private RefillRunner runner;
    private Thread worker;
    private volatile boolean stopping;
    private String notificationText;
    private String registrationToken = "";
    private String registrationEndpoint = "";

    static boolean isRunning() { return running; }

    static void start(Context context) {
        context.startForegroundService(new Intent(context, RefillService.class));
    }

    static void stop(Context context) {
        context.startService(new Intent(context, RefillService.class).setAction(STOP));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            if (worker == null) stopSelf();
            else stopWorker();
            return START_NOT_STICKY;
        }
        if (worker != null) return START_NOT_STICKY;
        store = new RefillStore(this);
        getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "ナンプレの連続補充", NotificationManager.IMPORTANCE_LOW));
        notificationText = "補充の依頼を確認します";
        Notification notice = notification(notificationText);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION, notice);
        }
        try {
            RefillBootstrap.apply(this, store);
        } catch (IOException | JSONException error) {
            store.status("自動登録の設定または端末保存を確認してください");
            if (store.registrationPending()) {
                RefillJob.schedule(this, false);
                RefillEnrollment.request(this);
            }
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!store.registrationReady()) {
            if (store.registrationPending()) {
                RefillJob.schedule(this, false);
                RefillEnrollment.request(this);
            }
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        running = true;
        registrationToken = store.token();
        registrationEndpoint = store.endpoint();
        runner = new RefillRunner(this, true, this::status);
        RefillRunner.preemptScheduled();
        store.status(notificationText);
        worker = new Thread(this::run, "nanpure-continuous-refill");
        worker.start();
        return START_NOT_STICKY;
    }

    private void run() {
        RefillRunner current = runner;
        ConnectivityManager networkManager = getSystemService(ConnectivityManager.class);
        try {
            while (!stopping) {
                Network network = networkManager.getActiveNetwork();
                long next;
                try {
                    next = current.execute(network);
                } catch (RefillApi.HttpFailure error) {
                    if (error.status == 403) {
                        if (store.registrationRejected(registrationToken, registrationEndpoint)) {
                            status("端末登録を確認してください");
                        }
                        break;
                    }
                    status("サーバーの応答待ち・連続補充で再試行します");
                    next = RETRY_MS;
                } catch (IOException | JSONException | RuntimeException error) {
                    status("補充を中断しました・連続補充で再試行します");
                    next = RETRY_MS;
                }
                if (next <= 0 || !waitWhileReady(current, networkManager, next)) break;
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } finally {
            current.stop();
            main.post(() -> finish(current));
        }
    }

    private boolean waitWhileReady(RefillRunner current, ConnectivityManager manager, long delay)
            throws InterruptedException {
        long deadline = SystemClock.elapsedRealtime() + delay;
        while (!stopping && current.ready(manager.getActiveNetwork())) {
            long remaining = deadline - SystemClock.elapsedRealtime();
            if (remaining <= 0) return true;
            Thread.sleep(Math.min(remaining, 5000));
        }
        return false;
    }

    private void status(String message) {
        if (stopping || !currentRegistration()) return;
        store.status(registrationToken, registrationEndpoint, message);
        main.post(() -> {
            if (stopping || worker == null || !currentRegistration() || message.equals(notificationText)) return;
            notificationText = message;
            getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(message));
        });
    }

    private boolean currentRegistration() {
        return store != null && store.registrationReady() && registrationToken.equals(store.token()) &&
                registrationEndpoint.equals(store.endpoint());
    }

    private Notification notification(String message) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, RefillService.class).setAction(STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle("ナンプレ補充係 高速版・連続補充")
                .setContentText(message)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "連続補充を停止する", stop).build())
                .build();
    }

    private void stopWorker() {
        if (stopping) return;
        stopping = true;
        if (runner != null) runner.stop();
        if (worker != null) worker.interrupt();
        if (store != null) store.status(registrationToken, registrationEndpoint, "連続補充を停止しました");
    }

    private void finish(RefillRunner current) {
        if (runner != current) return;
        runner = null;
        worker = null;
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        if (worker != null) stopWorker();
        super.onDestroy();
    }
}

package jp.nanpure.refill;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import java.net.URI;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public final class MainActivity extends Activity {
    private static final int INK = 0xff211e24;
    private static final int MUTED = 0xff5b5361;
    private static final int ACCENT = 0xff674b86;
    private static final int BACKDROP = 0xfff6f2f9;
    private static final int PAPER = Color.WHITE;

    private final Handler main = new Handler(Looper.getMainLooper());
    private RefillStore store;
    private LinearLayout pairingPanel;
    private LinearLayout settingsPanel;
    private EditText code;
    private EditText endpoint;
    private TextView notice;
    private TextView status;
    private TextView completed;
    private Switch automatic;
    private Switch metered;
    private Button register;
    private Button check;
    private boolean updating;
    private boolean busy;
    private final Runnable refreshTask = new Runnable() {
        @Override public void run() {
            refresh();
            main.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = new RefillStore(this);
        WindowInsets rootInsets = getWindow().getDecorView().getRootWindowInsets();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BACKDROP);
        LinearLayout content = column();
        scroll.addView(content);
        if (rootInsets != null) applyInsets(content, rootInsets);
        else content.setPadding(dp(20), dp(24), dp(20), dp(24));
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            applyInsets(content, insets);
            return insets;
        });
        setContentView(scroll);

        TextView eyebrow = text("ナンプレ帳  /  自販機", 13, ACCENT, true);
        content.addView(eyebrow);
        TextView title = text("ナンプレ補充係", 31, INK, true);
        add(content, title, 4);
        add(content, text("通常9×9・難易度18「至高」", 16, MUTED, false), 4);
        add(content, text("このスマホで問題を作り、サイトの在庫へ送ります。", 15, MUTED, false), 12);

        LinearLayout summary = card();
        add(content, summary, 20);
        summary.addView(text("端末の状態", 13, ACCENT, true));
        status = text("", 20, INK, true);
        add(summary, status, 6);
        completed = text("", 14, MUTED, false);
        add(summary, completed, 8);

        pairingPanel = card();
        add(content, pairingPanel, 14);
        pairingPanel.addView(text("初回登録", 19, INK, true));
        add(pairingPanel, text("管理画面で発行した登録コードを貼り付けてください。", 14, MUTED, false), 6);
        code = field("登録コード");
        add(pairingPanel, code, 10);
        Button showEndpoint = button("接続先を設定", false);
        add(pairingPanel, showEndpoint, 8);
        endpoint = field("接続先（HTTPS）");
        endpoint.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setText(BuildConfig.ENDPOINT);
        endpoint.setVisibility(View.GONE);
        add(pairingPanel, endpoint, 5);
        showEndpoint.setOnClickListener(view ->
                endpoint.setVisibility(endpoint.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        register = button("このスマホを登録する", true);
        add(pairingPanel, register, 10);
        register.setOnClickListener(view -> pair());

        settingsPanel = card();
        add(content, settingsPanel, 14);
        settingsPanel.addView(text("補充の設定", 19, INK, true));
        automatic = new Switch(this);
        automatic.setText("充電中に自動で補充する");
        add(settingsPanel, automatic, 12);
        automatic.setOnCheckedChangeListener((view, checked) -> {
            if (updating) return;
            store.enabled(checked);
            store.status(checked ? "充電と回線の条件待ち" : "自動補充を停止中");
            RefillJob.schedule(this, true);
            if (checked) RefillJob.request(this, 0);
        });
        metered = new Switch(this);
        metered.setText("モバイルデータなどの従量制回線を使う");
        add(settingsPanel, metered, 9);
        metered.setOnCheckedChangeListener((view, checked) -> {
            if (updating) return;
            store.meteredAllowed(checked);
            RefillJob.schedule(this, true);
            RefillJob.request(this, 0);
        });
        check = button("補充の依頼を今すぐ確認する", true);
        add(settingsPanel, check, 12);
        check.setOnClickListener(view -> {
            store.status("補充の確認を予約しました");
            RefillJob.request(this, 0);
            refresh();
        });
        Button unpair = button("このスマホの登録を解除する", false);
        add(settingsPanel, unpair, 6);
        unpair.setOnClickListener(view -> new AlertDialog.Builder(this)
                .setTitle("このスマホの登録を解除")
                .setMessage("端末内の送信待ちも消えます。サイト側の端末権限は管理画面から停止できます。")
                .setNegativeButton("戻る", null)
                .setPositiveButton("登録を解除する", (dialog, which) -> {
                    try {
                        store.unpair();
                        RefillJob.schedule(this, true);
                        notice.setText("");
                        refresh();
                    } catch (Exception error) {
                        notice.setText("登録の解除に失敗しました。もう一度お試しください。");
                    }
                }).show());

        notice = text("", 14, MUTED, false);
        notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(content, notice, 12);
        add(content, text("自動補充の開始時刻はAndroidが決めます。"
                + "通信が切れた場合は、完成済みの問題を端末に残して再送します。", 13, MUTED, false), 6);
        applyLink(getIntent());
        refresh();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyLink(intent);
    }

    @Override protected void onResume() {
        super.onResume();
        RefillJob.schedule(this, false);
        main.removeCallbacks(refreshTask);
        main.post(refreshTask);
    }

    @Override protected void onPause() {
        main.removeCallbacks(refreshTask);
        super.onPause();
    }

    private void applyLink(Intent intent) {
        Uri data = intent.getData();
        if (!store.token().isEmpty() || data == null ||
                !"nanpure-refill".equals(data.getScheme()) || !"pair".equals(data.getHost())) return;
        String linkCode = data.getQueryParameter("code");
        if (linkCode != null && linkCode.length() <= 128) code.setText(linkCode);
    }

    private void pair() {
        if (busy || !store.token().isEmpty()) return;
        String inputCode = code.getText().toString().trim();
        if (inputCode.isEmpty() || inputCode.length() > 128) {
            notice.setText("管理画面の登録コードを入力してください。");
            return;
        }
        String service;
        try {
            service = normalizeEndpoint(endpoint.getText().toString().trim());
        } catch (Exception error) {
            notice.setText("接続先は有効なHTTPSのURLを入力してください。");
            return;
        }
        busy = true;
        notice.setText("登録を確認しています…");
        refresh();
        new Thread(() -> {
            String failure = null;
            try {
                String token = store.pairingToken(inputCode, service);
                new RefillApi(null, service).call("", RefillApi.action("register")
                        .put("code", inputCode).put("token", token));
                store.paired(token, service);
            } catch (RefillApi.HttpFailure error) {
                failure = error.status >= 400 && error.status < 500
                        ? "登録コードが使えません。管理画面で新しく発行してください。"
                        : "サーバーに接続できませんでした。同じコードで再試行できます。";
            } catch (Exception error) {
                failure = "通信または端末保存を確認してください。同じコードで再試行できます。";
            }
            String message = failure;
            main.post(() -> {
                busy = false;
                if (message == null) {
                    RefillJob.schedule(getApplicationContext(), true);
                    RefillJob.request(getApplicationContext(), 0);
                    if (!isDestroyed()) code.setText("");
                }
                if (!isDestroyed()) {
                    notice.setText(message == null ? "このスマホを登録しました。" : message);
                    refresh();
                }
            });
        }, "nanpure-pairing").start();
    }

    static String normalizeEndpoint(String input) throws Exception {
        if (input.equals(BuildConfig.ENDPOINT)) return input;
        URI uri = new URI(input);
        String path = uri.getPath();
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null ||
                uri.getQuery() != null || uri.getFragment() != null ||
                (!path.isEmpty() && !"/".equals(path) && !"/api/vending/worker".equals(path))) {
            throw new IllegalArgumentException("Invalid refill endpoint");
        }
        return new URI("https", null, uri.getHost(), uri.getPort(),
                "/api/vending/worker", null, null).toString();
    }

    private void refresh() {
        boolean paired = !store.token().isEmpty();
        pairingPanel.setVisibility(paired ? View.GONE : View.VISIBLE);
        settingsPanel.setVisibility(paired ? View.VISIBLE : View.GONE);
        register.setEnabled(!busy);
        check.setEnabled(store.enabled());
        updating = true;
        automatic.setChecked(store.enabled());
        metered.setChecked(store.meteredAllowed());
        updating = false;
        status.setText(store.status());
        String info = "補充した問題  " + store.sent() + "問";
        if (store.updated() > 0) {
            DateTimeFormatter format = DateTimeFormatter.ofPattern("M/d HH:mm").withZone(ZoneId.systemDefault());
            info += "  ·  最終更新 " + format.format(Instant.ofEpochMilli(store.updated()));
        }
        completed.setText(info);
    }

    @SuppressWarnings("deprecation")
    private void applyInsets(LinearLayout view, WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= 30) {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(dp(20) + bars.left, dp(24) + bars.top, dp(20) + bars.right, dp(24) + bars.bottom);
        } else {
            view.setPadding(dp(20) + insets.getSystemWindowInsetLeft(), dp(24) + insets.getSystemWindowInsetTop(),
                    dp(20) + insets.getSystemWindowInsetRight(), dp(24) + insets.getSystemWindowInsetBottom());
        }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout card() {
        LinearLayout layout = column();
        layout.setPadding(dp(16), dp(16), dp(16), dp(16));
        layout.setBackground(surface(PAPER, 16));
        return layout;
    }

    private GradientDrawable surface(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radius));
        return shape;
    }

    private void add(LinearLayout parent, View view, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(top);
        parent.addView(view, params);
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private EditText field(String hint) {
        EditText view = new EditText(this);
        view.setSingleLine(true);
        view.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        view.setHint(hint);
        view.setContentDescription(hint);
        return view;
    }

    private Button button(String label, boolean filled) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        if (filled) {
            button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(ACCENT));
            button.setTextColor(PAPER);
        }
        return button;
    }
}

package jp.nanpure.owner;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

/** Small native, read-only author console. No WebView, remote code or bundled credentials. */
public final class MainActivity extends Activity {
    private static final String API = "https://puzzle-api.puzzle-hub-4826.workers.dev";
    private static final String SITE = "https://atugari.github.io/nanpure/";
    private static final String VERSION = "https://atugari.github.io/nanpure-version.json";
    private static final String MANAGE = SITE + "?view=manage";
    private static final String CLOUDFLARE = "https://dash.cloudflare.com/";
    private static final String GITHUB = "https://github.com/atugari/atugari.github.io/actions";
    private static final String KEY_ALIAS = "nanpure_owner_access_v1";
    private static final String PREFS = "private_owner_access";
    private static final int IMPORT_KEY = 7;
    private static final int BG = 0xfff7f6f2, INK = 0xff263d35, GREEN = 0xff286657;
    private static final int MUTED = 0xff69776f, LINE = 0xffdfe5df, PALE = 0xffeaf2ec;
    private static final int AMBER = 0xffa36a1f, AMBER_BG = 0xfffff2d9, ERROR = 0xffa24338;
    private static final NumberFormat NUM = NumberFormat.getIntegerInstance(Locale.JAPAN);
    private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");
    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("M/d HH:mm", Locale.JAPAN).withZone(TOKYO);
    private static final Pattern OWNER_KEY = Pattern.compile("(?<![a-fA-F0-9])[a-fA-F0-9]{64}(?![a-fA-F0-9])");

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private LinearLayout root, body, bottom;
    private EditText keyInput;
    private TextView loginError;
    private Button loginButton;
    private String ownerKey = "", version = "", problem = "", inquiryProblem = "";
    private JSONObject overview;
    private JSONArray inquiries = new JSONArray();
    private int tab = 0, generation = 0;
    private boolean busy, destroyed, resumed, versionStale;
    private long fetchedAt;
    private String inquiryFilter = "open";
    private JSONObject detail;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (state != null) tab = Math.max(0, Math.min(4, state.getInt("tab", 0)));
        try { ownerKey = readSavedKey(); } catch (Exception ignored) { ownerKey = ""; }
        if (ownerKey.isEmpty()) showLogin(""); else render();
    }

    @Override public void onResume() {
        super.onResume(); resumed = true;
        if (!ownerKey.isEmpty()) { if (!busy && overviewExpired()) refresh(false); else render(); }
    }
    @Override public void onPause() { resumed = false; super.onPause(); }
    @Override public void onSaveInstanceState(Bundle out) { out.putInt("tab", tab); super.onSaveInstanceState(out); }
    @Override public void onDestroy() { destroyed = true; generation++; network.shutdownNow(); main.removeCallbacksAndMessages(null); super.onDestroy(); }
    @Override public void onBackPressed() {
        if (detail != null) { detail = null; render(); }
        else if (!ownerKey.isEmpty() && tab != 0) { tab = 0; render(); }
        else super.onBackPressed();
    }

    private int dp(float n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); return v; }
    private LinearLayout row() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.HORIZONTAL); v.setGravity(Gravity.CENTER_VERTICAL); return v; }
    private GradientDrawable shape(int color, int stroke, float radius) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius));
        if (stroke != 0) d.setStroke(dp(1), stroke); return d;
    }
    private TextView text(String value, float size, int color, boolean bold) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color);
        v.setLineSpacing(dp(2), 1f); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        v.setFontFeatureSettings("tnum"); return v;
    }
    private void add(LinearLayout into, View v) { into.addView(v, new LinearLayout.LayoutParams(-1, -2)); }
    private void gap(LinearLayout into, int n) { View v = new View(this); into.addView(v, new LinearLayout.LayoutParams(1, dp(n))); }
    private LinearLayout card(LinearLayout into) {
        LinearLayout c = column(); c.setPadding(dp(18), dp(18), dp(18), dp(18)); c.setBackground(shape(Color.WHITE, LINE, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.bottomMargin = dp(14); into.addView(c, lp); return c;
    }
    private void title(LinearLayout into, String value, String note) {
        add(into, text(value, 25, INK, true));
        if (!note.isEmpty()) { gap(into, 6); add(into, text(note, 13, MUTED, false)); }
        gap(into, 18);
    }
    private void section(LinearLayout into, String value) { gap(into, 8); add(into, text(value, 16, INK, true)); gap(into, 12); }
    private Button button(String label, boolean primary, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setTextSize(15); b.setAllCaps(false); b.setMinHeight(dp(48));
        b.setMinimumHeight(dp(48)); b.setPadding(dp(14), dp(9), dp(14), dp(9));
        b.setTextColor(primary ? Color.WHITE : GREEN); b.setBackground(shape(primary ? GREEN : Color.WHITE, primary ? 0 : LINE, 12));
        b.setOnClickListener(v -> action.run()); return b;
    }
    private void actionRow(LinearLayout into, String label, String note, Runnable action) {
        LinearLayout c = card(into); LinearLayout r = row(); LinearLayout words = column();
        add(words, text(label, 16, INK, true)); if (!note.isEmpty()) { gap(words, 4); add(words, text(note, 12, MUTED, false)); }
        r.addView(words, new LinearLayout.LayoutParams(0, -2, 1)); TextView arrow = text("›", 28, GREEN, false); arrow.setPadding(dp(10),0,0,0); r.addView(arrow);
        add(c, r); c.setMinimumHeight(dp(64)); c.setFocusable(true); c.setContentDescription(label + (note.isEmpty() ? "" : "。" + note)); c.setOnClickListener(v -> action.run());
    }
    private void note(LinearLayout into, String value, boolean warning) {
        if (value == null || value.isEmpty()) return;
        TextView v = text(value, 13, warning ? AMBER : MUTED, false); v.setPadding(dp(14), dp(12), dp(14), dp(12));
        v.setBackground(shape(warning ? AMBER_BG : PALE, 0, 12)); add(into, v); gap(into, 14);
    }
    private String number(JSONObject o, String k) { return o != null && o.has(k) && !o.isNull(k) ? NUM.format(o.optLong(k)) : "—"; }
    private JSONObject obj(JSONObject o, String key) { return o == null ? null : o.optJSONObject(key); }
    private String str(JSONObject o, String key, String fallback) { return o == null || o.isNull(key) ? fallback : o.optString(key, fallback); }
    private String when(long ms) { return ms > 0 ? DATE.format(Instant.ofEpochMilli(ms)) : "未取得"; }
    private String whenIso(String iso) { try { return DATE.format(Instant.parse(iso)); } catch (Exception ignored) { return "未取得"; } }
    private long epoch(JSONObject o, String key) { return o == null || o.isNull(key) ? 0 : o.optLong(key); }
    private boolean sameDay(long first, long second, ZoneId zone) {
        return first > 0 && second > 0 && Instant.ofEpochMilli(first).atZone(zone).toLocalDate().equals(Instant.ofEpochMilli(second).atZone(zone).toLocalDate());
    }
    private boolean overviewExpired() {
        long now = System.currentTimeMillis(), snapshotAt = epoch(overview, "generatedAt");
        return overview == null || fetchedAt <= 0 || now - fetchedAt >= 60000 || !sameDay(snapshotAt, now, TOKYO) || !sameDay(snapshotAt, now, UTC);
    }
    private boolean trafficIsToday(JSONObject traffic) {
        return str(traffic, "day", "").equals(Instant.now().atZone(TOKYO).toLocalDate().toString());
    }
    private boolean snapshotIsToday() { return sameDay(epoch(overview, "generatedAt"), System.currentTimeMillis(), TOKYO); }
    private String metricStatus(JSONObject metric) {
        if (!metric.has("used") || metric.isNull("used")) return "unavailable";
        String reported = str(metric, "status", "unavailable");
        if (!"ready".equals(reported)) return reported;
        long measured = epoch(metric, "measuredAt"), now = System.currentTimeMillis();
        if (measured <= 0 || now - measured > 2 * 60 * 60 * 1000L || (metric.optBoolean("daily", false) && !sameDay(measured, now, UTC))) return "stale";
        return "ready";
    }
    private void updateVersion(String manifestVersion, JSONObject freshOverview) {
        String fresh = manifestVersion.trim();
        if (fresh.isEmpty()) fresh = str(obj(freshOverview, "site"), "version", "").trim();
        if (!fresh.isEmpty()) { version = fresh; versionStale = false; }
        else versionStale = !version.isEmpty();
    }
    private String bytes(double n) {
        if (n < 1000) return String.format(Locale.JAPAN, "%.0f B", n);
        if (n < 1000 * 1000) return String.format(Locale.JAPAN, "%.1f KB", n / 1000);
        if (n < 1000 * 1000 * 1000) return String.format(Locale.JAPAN, "%.1f MB", n / 1000 / 1000);
        return String.format(Locale.JAPAN, "%.2f GB", n / 1000 / 1000 / 1000);
    }

    private void showLogin(String message) {
        root = column(); root.setBackgroundColor(BG); root.setFitsSystemWindows(true); setContentView(root);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout c = column(); c.setPadding(dp(24), dp(42), dp(24), dp(30)); scroll.addView(c);
        TextView mark = text("N", 34, Color.WHITE, true); mark.setGravity(Gravity.CENTER); mark.setBackground(shape(GREEN,0,20));
        c.addView(mark,new LinearLayout.LayoutParams(dp(64),dp(64))); gap(c,24);
        add(c,text("ナンプレ帳",15,GREEN,true)); gap(c,6); add(c,text("作者室",32,INK,true)); gap(c,12);
        add(c,text("訪問状況、無料枠、お問い合わせを\nひとつのアプリで確認できます。",16,MUTED,false)); gap(c,28);
        LinearLayout access = card(c); add(access,text("作者として接続",19,INK,true)); gap(access,14);
        add(access,text("管理用キー",14,INK,true)); gap(access,8);
        keyInput = new EditText(this); keyInput.setSingleLine(true); keyInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        keyInput.setTextSize(15); keyInput.setHint("管理用キーを貼り付け"); keyInput.setPadding(dp(12),dp(12),dp(12),dp(12));
        keyInput.setBackground(shape(BG,LINE,10)); keyInput.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        keyInput.setSaveEnabled(false); add(access,keyInput); gap(access,10);
        add(access,text("お問い合わせ管理に使う64文字のキーです。CloudflareのAPIトークンとは別です。",12,MUTED,false)); gap(access,18);
        loginButton = button("接続する",true,() -> login(keyInput.getText().toString())); add(access,loginButton); gap(access,10);
        add(access,button("管理用ファイルから読み込む",false,this::importKey));
        loginError = text(message,13,ERROR,false); loginError.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); gap(access,12); add(access,loginError);
        note(c,"接続できたキーは、この端末内で暗号化して保存します。初回のみ入力が必要です。",false);
        add(c,text("作者室 1.0.0 · Android 8.0以降",12,MUTED,false));
    }

    private void login(String raw) {
        if (busy) return;
        final String key = raw.trim().toLowerCase(Locale.ROOT);
        if (!key.matches("[a-f0-9]{64}")) { loginError.setText("管理用キーを64文字すべて貼り付けてください。"); return; }
        busy = true; loginButton.setEnabled(false); loginButton.setText("接続を確認中…"); loginError.setText("");
        final int current = ++generation;
        network.execute(() -> {
            JSONObject data = null; JSONArray items = null; String error = "", contactError = "", siteVersion = ""; long receivedAt = 0;
            try { data = request(API + "/api/owner/overview", key); receivedAt = System.currentTimeMillis(); saveKey(key); }
            catch (Exception ex) { error = friendly(ex); }
            if (error.isEmpty() && data != null) {
                try { items = request(API + "/api/admin", key).optJSONArray("items"); } catch (Exception ex) { contactError = "お問い合わせを取得できませんでした。更新で再試行できます。"; }
                try { siteVersion = str(request(VERSION, null), "version", ""); } catch (Exception ignored) {}
            }
            final JSONObject result = data; final JSONArray newItems = items; final String message = error, contactFailure = contactError, newVersion = siteVersion; final long overviewReceivedAt = receivedAt;
            main.post(() -> {
                if (destroyed || current != generation) return; busy = false;
                if (!message.isEmpty()) { loginButton.setEnabled(true); loginButton.setText("接続する"); loginError.setText(message); return; }
                ownerKey = key; overview = result; fetchedAt = overviewReceivedAt; problem = ""; inquiryProblem = contactFailure;
                if (newItems != null) inquiries = newItems; updateVersion(newVersion, result);
                InputMethodManager im = (InputMethodManager)getSystemService(INPUT_METHOD_SERVICE); im.hideSoftInputFromWindow(keyInput.getWindowToken(),0);
                keyInput.setText(""); if (resumed) render();
            });
        });
    }

    private void importKey() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("text/*"); i.addCategory(Intent.CATEGORY_OPENABLE);
        try { startActivityForResult(i, IMPORT_KEY); } catch (Exception ignored) { toast("ファイルアプリを開けません。キーを貼り付けてください。"); }
    }
    @Override public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode != IMPORT_KEY || resultCode != RESULT_OK || data == null || data.getData() == null || keyInput == null) return;
        try (InputStream in = getContentResolver().openInputStream(data.getData())) {
            String contents = new String(readBytes(in,65536),StandardCharsets.UTF_8); Matcher m = OWNER_KEY.matcher(contents);
            String found = null;
            while (m.find()) { String next = m.group().toLowerCase(Locale.ROOT); if (found != null && !found.equals(next)) throw new IllegalArgumentException(); found = next; }
            if (found == null) throw new IllegalArgumentException(); keyInput.setText(found); loginError.setText("読み込めました。「接続する」を押してください。");
        } catch (Exception ignored) { loginError.setText("管理用キーを1つ含むテキストファイルを選んでください。"); }
    }

    private void render() {
        if (ownerKey.isEmpty()) { showLogin(""); return; }
        root = column(); root.setBackgroundColor(BG); root.setFitsSystemWindows(true); setContentView(root);
        LinearLayout header = row(); header.setPadding(dp(20),dp(12),dp(16),dp(10));
        LinearLayout name = column(); add(name,text("ナンプレ帳",12,GREEN,true)); add(name,text("作者室",22,INK,true));
        header.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        Button refresh = button(busy ? "取得中…" : "更新",false,() -> refresh(true)); refresh.setEnabled(!busy); header.addView(refresh,new LinearLayout.LayoutParams(dp(84),dp(48))); add(root,header);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setClipToPadding(false);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1)); body = column(); body.setPadding(dp(20),dp(14),dp(20),dp(22)); scroll.addView(body);
        if (!problem.isEmpty()) note(body,problem + (overview == null ? "" : "\n前回取得した内容を表示しています。"),true);
        if (tab == 4 && detail == null) showSettings(body);
        else if (overview == null) { empty(body,busy?"状況を読み込んでいます":"まだ取得できていません",busy?"少しお待ちください。":"上の「更新」から再試行できます。"); }
        else if (detail != null) showInquiryDetail(body);
        else if (tab == 0) showHome(body);
        else if (tab == 1) showTraffic(body);
        else if (tab == 2) showUsage(body);
        else if (tab == 3) showInquiries(body);
        bottom = row(); bottom.setBackgroundColor(Color.WHITE); bottom.setPadding(dp(8),dp(6),dp(8),dp(10));
        String[] names = {"概況","訪問","使用量","問合せ","設定"};
        for (int n = 0; n < names.length; n++) { final int index=n; TextView b=text(names[n],13,tab==n?GREEN:MUTED,tab==n); b.setGravity(Gravity.CENTER); b.setPadding(dp(3),dp(16),dp(3),dp(16));
            b.setBackground(shape(tab==n?PALE:Color.WHITE,0,12)); b.setFocusable(true); b.setContentDescription(names[n]+(tab==n?"、選択中":"")); b.setSelected(tab==n);
            b.setOnClickListener(v->{tab=index;detail=null;render();}); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(52),1); p.setMargins(dp(2),0,dp(2),0);bottom.addView(b,p); }
        add(root,bottom);
    }

    private void showHome(LinearLayout page) {
        title(page,"いまのサイト", "最終取得 " + when(fetchedAt) + " · 日本時間");
        JSONObject site=obj(overview,"site"), traffic=obj(overview,"traffic"), today=obj(traffic,"today"), contacts=obj(overview,"inquiries"), stock=obj(overview,"stock");
        boolean oldOverview = !problem.isEmpty() || (!busy && overviewExpired());
        LinearLayout release=card(page); LinearLayout state=row(); TextView dot=text(busy?"● 更新中":oldOverview?"● 前回の取得内容":"● 接続できています",13,oldOverview?AMBER:GREEN,true);state.addView(dot);add(release,state);gap(release,12);
        add(release,text("公開バージョン",12,MUTED,false));gap(release,4);
        String currentVersion = version.isEmpty()?str(site,"version","取得できません"):version;
        TextView v=text(currentVersion,24,INK,true);v.setTextIsSelectable(true);add(release,v);gap(release,12);
        if(versionStale)note(release,"前回確認したバージョンです。今回は最新の版を確認できませんでした。",true);
        add(release,button("サイトを開く",false,()->open(SITE)));
        LinearLayout numbers=row(); stats(numbers,trafficIsToday(traffic)?"今日の訪問端末":str(traffic,"day","取得時")+"の訪問端末",number(today,"browsers"),"台",false);stats(numbers,"未完了のお問い合わせ",number(contacts,"open"),"件",true);add(page,numbers);gap(page,14);
        LinearLayout daily=card(page);add(daily,text("日替わり問題の準備",16,INK,true));gap(daily,12);
        pair(daily,snapshotIsToday()?"今日の問題":"前回取得日の問題",number(stock,"todayCount")+" / 3問");pair(daily,"用意できている日数",number(stock,"readyDays")+"日");
        pair(daily,"準備済みの日付",str(stock,"through","未取得"));
        if(!snapshotIsToday())note(daily,"日付が変わりました。今日の準備状況は更新して確認してください。",true);
        else if(stock!=null&&stock.optInt("todayCount",-1)<3)note(daily,"今日の問題が3問そろっていません。公開処理を確認してください。",true);
        JSONObject usage=obj(overview,"usage");JSONArray metrics=usage==null?null:usage.optJSONArray("metrics");boolean near=false,missing=false;
        if(metrics!=null)for(int i=0;i<metrics.length();i++){JSONObject m=metrics.optJSONObject(i);if(m==null)continue;if(!"ready".equals(metricStatus(m)))missing=true;else if(m.optDouble("limit",0)>0&&m.optDouble("used",0)/m.optDouble("limit")>=.8)near=true;}
        actionRow(page,near?"無料枠が残り少なくなっています":"無料枠の使用状況",missing?"未取得・前回の値を含みます。使用量画面で確認できます。":"サーバー・データの利用状況を確認",()->{tab=2;render();});
        actionRow(page,"お問い合わせを確認",number(contacts,"received")+"件の新着 · 全"+number(contacts,"total")+"件",()->{tab=3;render();});
        note(page,"訪問端末は、同じ日のブラウザーをまとめた目安です。人数そのものではありません。",false);
    }

    private void stats(LinearLayout into,String label,String value,String unit,boolean accent){
        LinearLayout c=column();c.setPadding(dp(14),dp(16),dp(12),dp(16));c.setBackground(shape(accent?GREEN:Color.WHITE,accent?0:LINE,16));
        add(c,text(label,11,accent?0xffd7eee3:MUTED,true));gap(c,10);LinearLayout r=row();r.addView(text(value,31,accent?Color.WHITE:INK,true));TextView u=text(unit,13,accent?Color.WHITE:MUTED,false);u.setPadding(dp(4),dp(12),0,0);r.addView(u);add(c,r);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-1,1);if(into.getChildCount()>0)p.leftMargin=dp(10);into.addView(c,p);
    }
    private void pair(LinearLayout into,String label,String value){LinearLayout r=row();TextView l=text(label,13,MUTED,false);r.addView(l,new LinearLayout.LayoutParams(0,-2,1));TextView v=text(value,15,INK,true);v.setGravity(Gravity.END);v.setMaxWidth(dp(185));r.addView(v);add(into,r);gap(into,10);}
    private void empty(LinearLayout page,String heading,String explanation){LinearLayout c=card(page);add(c,text(heading,18,INK,true));gap(c,10);add(c,text(explanation,14,MUTED,false));}

    private void showTraffic(LinearLayout page){
        JSONObject traffic=obj(overview,"traffic"),today=obj(traffic,"today");title(page,"訪問のようす",str(traffic,"day","今日")+" · 日本時間で日付を集計");
        boolean currentDay=trafficIsToday(traffic);LinearLayout r=row();stats(r,currentDay?"今日の訪問端末":"表示日の訪問端末",number(today,"browsers"),"台",true);stats(r,currentDay?"今日の訪問回数":"表示日の訪問回数",number(today,"visits"),"回",false);add(page,r);gap(page,18);
        if(!currentDay)note(page,"前回取得した日の記録です。今日の訪問は更新して確認してください。",true);
        note(page,str(traffic,"note","訪問端末は同日のブラウザー単位の目安です。人数とは異なります。"),false);
        section(page,"日ごとの記録");JSONArray days=traffic==null?null:traffic.optJSONArray("history");
        if(days==null||days.length()==0){empty(page,"これから記録がたまります","計測開始後の訪問をここに表示します。過去の訪問はさかのぼって集計できません。");return;}
        LinearLayout c=card(page);int max=1;for(int i=0;i<days.length();i++){JSONObject d=days.optJSONObject(i);if(d!=null)max=Math.max(max,d.optInt("browsers"));}
        for(int i=days.length()-1;i>=0;i--){JSONObject d=days.optJSONObject(i);if(d==null)continue;pair(c,str(d,"day",""),number(d,"browsers")+"台 / "+number(d,"visits")+"回");
            meter(c,d.optDouble("browsers",0)/max,GREEN);gap(c,14);}
        add(page,text("計測開始 "+when(epoch(traffic,"since")),12,MUTED,false));
    }

    private void showUsage(LinearLayout page){
        JSONObject usage=obj(overview,"usage"),storage=obj(overview,"storage");title(page,"無料枠と保存容量","Cloudflareの使用量と、サイト内の保存状況");
        note(page,"無料枠の日付はUTC基準です。1日の区切りは日本時間の午前9時です。",false);
        JSONObject period=obj(usage,"period");if(period!=null){add(page,text("日次使用量の集計期間\n"+whenIso(period.optString("start"))+" 〜 "+whenIso(period.optString("end"))+"（日本時間）",12,MUTED,false));gap(page,16);}
        JSONArray metrics=usage==null?null:usage.optJSONArray("metrics");
        if(metrics==null||metrics.length()==0)empty(page,"使用量を取得できません","Cloudflareの管理画面から確認できます。");
        else for(int i=0;i<metrics.length();i++){JSONObject m=metrics.optJSONObject(i);if(m!=null)usageCard(page,m);}
        add(page,text("使用量の取得 "+when(epoch(usage,"capturedAt"))+"\n直近の確認 "+when(epoch(usage,"lastAttemptAt")),12,MUTED,false));gap(page,16);
        String usageNote=str(usage,"note","");if(!usageNote.isEmpty())note(page,usageNote,false);
        add(page,button("Cloudflareで確認する",false,()->open(CLOUDFLARE)));gap(page,20);
        section(page,"このサイトが保存しているデータ");
        LinearLayout c=card(page);pair(c,"クラウド保存の件数",number(storage,"backupCount")+"件");
        pair(c,"クラウド保存",storage!=null&&storage.has("backupBytes")?bytes(storage.optDouble("backupBytes")):"未取得");
        if(storage!=null&&storage.optDouble("backupLimitBytes",0)>0){meter(c,storage.optDouble("backupBytes",0)/storage.optDouble("backupLimitBytes"),GREEN);gap(c,8);add(c,text("サイト内の保存上限 "+bytes(storage.optDouble("backupLimitBytes")),12,MUTED,false));gap(c,14);}
        pair(c,"アップロード中",storage!=null&&storage.has("uploadBytes")?bytes(storage.optDouble("uploadBytes")):"未取得");
        pair(c,"お問い合わせ画像",storage!=null&&storage.has("contactImageBytes")?bytes(storage.optDouble("contactImageBytes")):"未取得");
        note(page,"保存データの内訳とCloudflareアカウント全体の使用量は、集計対象が異なります。",false);
    }

    private void usageCard(LinearLayout page,JSONObject m){
        String id=m.optString("id"),label=m.optString("label","使用量");
        if(id.equals("workersRequests"))label="サーバーへの呼び出し";else if(id.equals("d1RowsRead"))label="データの読み取り";else if(id.equals("d1RowsWritten"))label="データの書き込み";else if(id.equals("d1StorageBytes"))label="データ保存容量";else if(id.equals("d1DatabaseBytes"))label="このデータベースの容量";
        LinearLayout c=card(page);add(c,text(label,16,INK,true));gap(c,4);add(c,text("database".equals(m.optString("scope"))?"このサイトのデータベース":"Cloudflareアカウント全体",11,MUTED,false));gap(c,14);
        String unit=m.optString("unit"),status=metricStatus(m);double limit=m.optDouble("limit",0);boolean has=m.has("used")&&!m.isNull("used");
        if(!has){add(c,text("未取得",25,AMBER,true));gap(c,8);add(c,text("0としては扱いません。",12,MUTED,false));}
        else{double used=m.optDouble("used",0),ratio=limit>0?used/limit:0;add(c,text(unit.equals("bytes")?bytes(used):NUM.format(used)+(unit.equals("rows")?" 行":" 回"),25,INK,true));gap(c,8);
            meter(c,ratio,ratio>=.8?AMBER:GREEN);gap(c,8);String cap=unit.equals("bytes")?bytes(limit):NUM.format(limit)+(unit.equals("rows")?"行":"回");
            add(c,text("無料枠 "+cap+(limit>0?String.format(Locale.JAPAN," · %.1f%%",ratio*100):""),12,MUTED,false));
            if(!"ready".equals(status)){gap(c,8);add(c,text("前回の取得値です。現在の使用量とは異なる場合があります。",12,AMBER,false));}}
        String note=m.optString("note","");if(!note.isEmpty()){gap(c,10);add(c,text(note,12,MUTED,false));}
        if(epoch(m,"measuredAt")>0){gap(c,8);add(c,text("この値の取得 "+when(epoch(m,"measuredAt")),11,MUTED,false));}
    }
    private void meter(LinearLayout into,double ratio,int color){ProgressBar b=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);b.setMax(1000);b.setProgress((int)Math.max(0,Math.min(1000,ratio*1000)));b.setProgressTintList(android.content.res.ColorStateList.valueOf(color));b.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(LINE));into.addView(b,new LinearLayout.LayoutParams(-1,dp(8)));}

    private String statusLabel(String status){switch(status){case "received":return "新着";case "reading":return "確認中";case "answered":return "返答済み";case "closed":return "完了";default:return status.isEmpty()?"未分類":status;}}
    private String contactLabel(String value){switch(value){
        case "question":return "使い方の質問";case "bug":return "不具合の報告";case "suggestion":return "改善の希望";case "payment":return "海外からの支払い報告";case "other":return "その他";
        case "howto":return "遊び方";case "save":return "保存・読み込み";case "ranking":return "ランキング";case "language":return "言語";case "display":return "表示がおかしい";case "input":return "操作できない";case "generation":return "問題を生成できない";case "ruby":return "ふりがなが違う";case "usability":return "画面・操作";case "rules":return "ルール・問題";case "accessibility":return "読みやすさ";
        case "japan":return "日本";case "asia":return "アジア（日本以外）";case "europe":return "ヨーロッパ";case "americas":return "北米・中南米";case "oceania":return "オセアニア";case "africa":return "アフリカ";case "unknown":return "回答しない";
        case "success":return "利用できた";case "failed":return "利用できなかった";case "notTried":return "まだ試していない";
        case "visa":return "Visa";case "mastercard":return "Mastercard";case "amex":return "American Express";case "jcb":return "JCB";case "diners":return "Diners Club";case "discover":return "Discover";case "apple":return "Apple Pay";case "google":return "Google Pay";
        case "ja":return "日本語";case "en":return "英語";case "zh-Hans":return "中国語（簡体字）";case "zh-Hant":return "中国語（繁体字）";case "ko":return "韓国語";case "es":return "スペイン語";case "fr":return "フランス語";case "de":return "ドイツ語";case "pt":return "ポルトガル語";default:return value;
    }}
    private boolean isOpen(JSONObject item){String s=item.optString("status");return !"answered".equals(s)&&!"closed".equals(s);}
    private void showInquiries(LinearLayout page){
        JSONObject counts=obj(overview,"inquiries");title(page,"お問い合わせ","未完了 "+number(counts,"open")+"件 · 全"+number(counts,"total")+"件");
        if(!inquiryProblem.isEmpty())note(page,inquiryProblem,true);
        LinearLayout filter=row();String[] keys={"open","received","all"},names={"未完了","新着","すべて"};
        for(int i=0;i<keys.length;i++){final String k=keys[i];Button b=button(names[i],inquiryFilter.equals(k),()->{inquiryFilter=k;render();});LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(48),1);if(i>0)p.leftMargin=dp(8);filter.addView(b,p);}add(page,filter);gap(page,18);
        int shown=0;for(int i=0;i<inquiries.length();i++){JSONObject item=inquiries.optJSONObject(i);if(item==null)continue;
            if(inquiryFilter.equals("open")&&!isOpen(item)||inquiryFilter.equals("received")&&!item.optString("status").equals("received"))continue;shown++;
            LinearLayout c=card(page);LinearLayout r=row();TextView badge=text(statusLabel(item.optString("status")),12,isOpen(item)?GREEN:MUTED,true);badge.setPadding(dp(8),dp(4),dp(8),dp(4));badge.setBackground(shape(isOpen(item)?PALE:BG,0,6));r.addView(badge);
            TextView date=text(when(item.optLong("created")),12,MUTED,false);date.setGravity(Gravity.END);r.addView(date,new LinearLayout.LayoutParams(0,-2,1));add(c,r);gap(c,10);
            String topic=str(item,"topic","").trim();add(c,text(topic.isEmpty()?contactLabel(str(item,"category","お問い合わせ")):contactLabel(topic),16,INK,true));gap(c,7);TextView preview=text(str(item,"detail",""),14,MUTED,false);preview.setMaxLines(3);preview.setEllipsize(android.text.TextUtils.TruncateAt.END);add(c,preview);gap(c,12);add(c,text("内容を確認する  ›",13,GREEN,true));
            c.setFocusable(true);c.setOnClickListener(v->{detail=item;render();});
        }
        if(shown==0)empty(page,"該当するお問い合わせはありません",inquiryFilter.equals("all")?"新しいお問い合わせが届くと、ここに表示します。":"「すべて」から過去のお問い合わせを確認できます。");
        add(page,text("最新100件まで表示します。返答・対応状況の変更は管理画面で行えます。",12,MUTED,false));gap(page,14);add(page,button("お問い合わせ管理を開く",false,()->open(MANAGE)));
    }

    private void showInquiryDetail(LinearLayout page){
        add(page,button("‹ お問い合わせ一覧",false,()->{detail=null;render();}));gap(page,18);
        JSONObject item=detail;title(page,str(item,"topic","").isEmpty()?"お問い合わせの内容":contactLabel(str(item,"topic","")),statusLabel(item.optString("status"))+" · "+when(item.optLong("created")));
        LinearLayout c=card(page);add(c,text("届いた内容",13,GREEN,true));gap(c,12);TextView content=text(str(item,"detail",""),16,INK,false);content.setTextIsSelectable(true);add(c,content);
        for(String[] field:new String[][]{{"category","種類"},{"region","場所"},{"method","決済方法"},{"result","結果"},{"locale","言語"}}){String value=str(item,field[0],"");if(!value.isEmpty()){gap(c,10);pair(c,field[1],contactLabel(value));}}
        String response=str(item,"response","");LinearLayout reply=card(page);add(reply,text("返答",15,GREEN,true));gap(reply,10);TextView replyText=text(response.isEmpty()?"まだ返答していません。":response,15,response.isEmpty()?MUTED:INK,false);replyText.setTextIsSelectable(true);add(reply,replyText);
        if(!str(item,"imageSource","").isEmpty())note(page,"添付画像は管理画面で確認できます。",false);
        String context=str(item,"context","");if(!context.isEmpty())try{JSONObject info=new JSONObject(context);LinearLayout environment=card(page);add(environment,text("送信時の状況",15,INK,true));gap(environment,12);
            for(String[] field:new String[][]{{"screen","画面"},{"puzzle","問題"},{"version","バージョン"},{"browser","ブラウザー"},{"viewport","画面サイズ"}}){String value=info.optString(field[0],"");if(!value.isEmpty())pair(environment,field[1],value);}
        }catch(JSONException ignored){}
        add(page,button("管理画面で確認・返答する",true,()->open(MANAGE)));gap(page,14);
        add(page,text("受付番号 "+item.optString("id"),11,MUTED,false));gap(page,8);
        add(page,button("受付番号をコピー",false,()->copy("受付番号",item.optString("id"))));
    }

    private void showSettings(LinearLayout page){
        title(page,"作者室の設定","接続と管理先へのショートカット");
        LinearLayout c=card(page);pair(c,"作者室アプリ","1.0.0");pair(c,"サイト",(version.isEmpty()?str(obj(overview,"site"),"version","未取得"):version)+(versionStale?"（前回確認）":""));pair(c,"サーバー",str(obj(overview,"site"),"apiVersion","未取得"));
        add(c,text("管理用キーはこの端末内で暗号化しています。お問い合わせの内容を端末のファイルへ保存しません。",12,MUTED,false));
        actionRow(page,"ナンプレ帳を開く","公開中のサイト",()->open(SITE));
        actionRow(page,"Cloudflareを開く","無料枠・サーバー・データベース",()->open(CLOUDFLARE));
        actionRow(page,"公開処理を確認","GitHubの更新履歴と実行状況",()->open(GITHUB));
        actionRow(page,"お問い合わせ管理","ブラウザーの管理画面",()->open(MANAGE));
        LinearLayout help=card(page);add(help,text("数値について",16,INK,true));gap(help,10);add(help,text("・訪問端末はブラウザー単位の目安で、実人数ではありません。\n・訪問は日本時間、無料枠はUTCで集計します。\n・無料枠の使用量は取得時刻を確認してください。\n・取得できない数値は「未取得」と表示します。",13,MUTED,false));
        add(page,button("この端末の接続を解除",false,()->new AlertDialog.Builder(this).setTitle("接続を解除しますか？").setMessage("この端末に保存した管理用キーを消します。サイト側のデータは残ります。").setNegativeButton("戻る",null).setPositiveButton("接続を解除",(d,w)->logout()).show()));
    }

    private void refresh(boolean requested){
        if(!resumed||busy||ownerKey.isEmpty())return;busy=true;final String key=ownerKey;final int current=++generation;render();
        network.execute(()->{
            JSONObject data=null;JSONArray items=null;String error="",contactError="",siteVersion="";long receivedAt=0;
            try{data=request(API+"/api/owner/overview",key);receivedAt=System.currentTimeMillis();}catch(Exception ex){error=friendly(ex);}
            if(data!=null){try{items=request(API+"/api/admin",key).optJSONArray("items");}catch(Exception ex){contactError="お問い合わせを取得できませんでした。更新で再試行できます。";}
                try{siteVersion=str(request(VERSION,null),"version","");}catch(Exception ignored){}}
            final JSONObject result=data;final JSONArray newItems=items;final String failure=error,contactFailure=contactError,newVersion=siteVersion;final long overviewReceivedAt=receivedAt;
            main.post(()->{if(destroyed||current!=generation)return;busy=false;problem=failure;
                if(result!=null){overview=result;fetchedAt=overviewReceivedAt;inquiryProblem=contactFailure;if(newItems!=null){inquiries=newItems;if(detail!=null){String id=detail.optString("id");for(int i=0;i<inquiries.length();i++){JSONObject item=inquiries.optJSONObject(i);if(item!=null&&id.equals(item.optString("id"))){detail=item;break;}}}}updateVersion(newVersion,result);}
                if(resumed){render();if(requested&&failure.isEmpty())toast("最新の状況に更新しました");}});
        });
    }

    private static JSONObject request(String address,String key)throws Exception{
        if(!address.startsWith(API+"/")&&!address.equals(VERSION))throw new SecurityException("Destination rejected");
        HttpsURLConnection c=(HttpsURLConnection)new URL(address).openConnection();c.setInstanceFollowRedirects(false);c.setRequestMethod("GET");c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setUseCaches(false);
        c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-cache");c.setRequestProperty("User-Agent","NanpureOwner/1.0.0 Android");
        if(address.startsWith(API+"/")){c.setRequestProperty("Origin","https://atugari.github.io");if(key!=null&&!key.isEmpty())c.setRequestProperty("Authorization","Bearer "+key);}
        try{int status=c.getResponseCode();if(status==401||status==403)throw new AccessException();if(status<200||status>=300)throw new ApiException(status);
            try(InputStream in=c.getInputStream()){return new JSONObject(new String(readBytes(in,2*1024*1024),StandardCharsets.UTF_8));}
        }finally{c.disconnect();}
    }
    private static byte[] readBytes(InputStream in,int limit)throws Exception{
        if(in==null)throw new IllegalArgumentException();ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
        while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IllegalArgumentException("Response too large");out.write(buffer,0,n);}return out.toByteArray();
    }
    private static class AccessException extends Exception{}
    private static class ApiException extends Exception{final int code;ApiException(int c){code=c;}}
    private String friendly(Exception e){if(e instanceof AccessException)return "管理用キーを確認してください。作者専用のキーが必要です。";
        if(e instanceof ApiException&&((ApiException)e).code==404)return "作者室用のサーバーがまだ準備できていません。少し待って再試行してください。";
        if(e instanceof ApiException&&((ApiException)e).code==429)return "アクセスが続いています。少し待って再試行してください。";
        return "接続できませんでした。通信状態を確認して再試行してください。";}

    private SecretKey storageKey()throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(KEY_ALIAS)){KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());gen.generateKey();}
        return (SecretKey)store.getKey(KEY_ALIAS,null);
    }
    private void saveKey(String key)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,storageKey());byte[] value=c.doFinal(key.getBytes(StandardCharsets.UTF_8));
        if(!getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString("iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)).putString("ciphertext",Base64.encodeToString(value,Base64.NO_WRAP)).commit())throw new IllegalStateException("Storage unavailable");
    }
    private String readSavedKey()throws Exception{
        SharedPreferences p=getSharedPreferences(PREFS,MODE_PRIVATE);String encrypted=p.getString("ciphertext",null),iv=p.getString("iv",null);if(encrypted==null||iv==null)return "";
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,storageKey(),new GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP)));String key=new String(c.doFinal(Base64.decode(encrypted,Base64.NO_WRAP)),StandardCharsets.UTF_8);return key.matches("[a-f0-9]{64}")?key:"";
    }
    private void logout(){generation++;busy=false;ownerKey="";overview=null;inquiries=new JSONArray();detail=null;version="";versionStale=false;problem="";getSharedPreferences(PREFS,MODE_PRIVATE).edit().clear().apply();
        try{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);store.deleteEntry(KEY_ALIAS);}catch(Exception ignored){}showLogin("");}
    private void open(String address){if(!address.equals(SITE)&&!address.equals(MANAGE)&&!address.equals(CLOUDFLARE)&&!address.equals(GITHUB))return;
        try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(address)));}catch(Exception ignored){toast("ブラウザーを開けませんでした。");}}
    private void copy(String label,String value){ClipboardManager clipboard=(ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);clipboard.setPrimaryClip(ClipData.newPlainText(label,value));toast("コピーしました");}
    private void toast(String value){Toast.makeText(this,value,Toast.LENGTH_SHORT).show();}
}

package jp.nanpure.refill;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.BooleanSupplier;

final class RefillEngine {
    private static final String HOST = "nanpure-refill.invalid";
    private static final String START = "https://" + HOST + "/index.html";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private final Context context;
    private volatile Round active;
    private volatile boolean closed;
    private int nextId;
    private WebView view;
    private boolean ready;

    private static final class Round {
        final int id, budgetMs;
        final String profile;
        final CompletableFuture<JSONObject> result = new CompletableFuture<>();
        boolean started;

        Round(int id, String profile, int budgetMs) {
            this.id = id;
            this.profile = profile;
            this.budgetMs = budgetMs;
        }
    }

    RefillEngine(Context context) {
        this.context = context;
    }

    JSONObject generate(int budgetMs, BooleanSupplier canContinue)
            throws InterruptedException, IOException, TimeoutException {
        return generate(RefillProfiles.PILOT_KEY, budgetMs, canContinue);
    }

    JSONObject generate(String profile, int budgetMs, BooleanSupplier canContinue)
            throws InterruptedException, IOException, TimeoutException {
        if (budgetMs < 500 || budgetMs > 120000 || RefillProfiles.find(context, profile) == null) {
            throw new IOException("Unknown refill profile or invalid search budget");
        }
        Round round = begin(profile, budgetMs);
        MAIN.post(() -> load(round));
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(budgetMs + 25000L);
        try {
            while (true) {
                if (round.result.isDone()) return round.result.get();
                if (!canContinue.getAsBoolean()) throw new InterruptedException("Refill conditions changed");
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) throw new TimeoutException();
                try {
                    return round.result.get(Math.min(TimeUnit.SECONDS.toNanos(1), remaining), TimeUnit.NANOSECONDS);
                } catch (TimeoutException ignored) {
                    // Recheck charging, network and thermal conditions while the worker searches.
                }
            }
        } catch (CancellationException error) {
            throw new InterruptedException("Refill search cancelled");
        } catch (ExecutionException error) {
            cancel();
            throw new IOException("Refill engine could not start", error.getCause());
        } catch (InterruptedException | TimeoutException | RuntimeException error) {
            cancel();
            throw error;
        } finally {
            end(round);
        }
    }

    private synchronized Round begin(String profile, int budgetMs) throws IOException {
        if (closed || active != null) throw new IOException("Refill engine is unavailable");
        Round round = new Round(++nextId, profile, budgetMs);
        active = round;
        return round;
    }

    private synchronized void end(Round round) {
        if (active == round) active = null;
    }

    synchronized void cancel() {
        if (closed) return;
        closed = true;
        if (active != null) active.result.cancel(false);
        active = null;
        MAIN.post(this::destroy);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void load(Round round) {
        if (closed || active != round) return;
        try {
            if (view != null) {
                start(round);
                return;
            }
            view = new WebView(context);
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setAllowFileAccess(false);
            view.getSettings().setAllowContentAccess(false);
            view.addJavascriptInterface(new ResultBridge(), "RefillBridge");
            view.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                    return true;
                }

                @Override public WebResourceResponse shouldInterceptRequest(WebView webView, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost()) ||
                            url.getPort() != -1 || url.getQuery() != null) return blocked();
                    String file = url.getLastPathSegment();
                    if (file == null || !(file.equals("index.html") || file.equals("bridge.js") ||
                            file.equals("round.js") || file.equals("engine.js")) ||
                            !("/" + file).equals(url.getEncodedPath())) return blocked();
                    try {
                        return new WebResourceResponse(file.endsWith(".html") ? "text/html" : "text/javascript",
                                "UTF-8", context.getAssets().open(file));
                    } catch (IOException e) {
                        return blocked();
                    }
                }

                @Override public void onPageFinished(WebView webView, String url) {
                    if (START.equals(url) && webView == view) {
                        ready = true;
                        Round current = active;
                        if (current != null) start(current);
                    }
                }

                @Override public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    fail(new IOException("WebView renderer stopped"));
                    return true;
                }
            });
            view.loadUrl(START);
        } catch (RuntimeException error) {
            fail(error);
        }
    }

    private void start(Round round) {
        if (closed || active != round || !ready || round.started) return;
        round.started = true;
        try {
            view.evaluateJavascript("runRefillRound(" + round.id + "," +
                    JSONObject.quote(round.profile) + "," + round.budgetMs + ")", null);
        } catch (RuntimeException error) {
            fail(error);
        }
    }

    private void fail(Exception error) {
        Round round = active;
        if (round != null) round.result.completeExceptionally(error);
        cancel();
        destroy();
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private void destroy() {
        if (view == null) return;
        ready = false;
        view.removeJavascriptInterface("RefillBridge");
        view.stopLoading();
        view.destroy();
        view = null;
    }

    public final class ResultBridge {
        @JavascriptInterface public void finish(int id, String json) {
            Round round = active;
            if (round == null || round.id != id || closed) return;
            if (json == null || json.length() > 300000) {
                round.result.completeExceptionally(new IOException("Invalid engine response size"));
                return;
            }
            try {
                JSONObject value = new JSONObject(json);
                if (value.has("puzzle") && !round.profile.equals(value.optString("profile"))) {
                    throw new JSONException("Unexpected refill profile");
                }
                round.result.complete(value);
            } catch (JSONException error) {
                round.result.completeExceptionally(error);
            }
        }
    }
}

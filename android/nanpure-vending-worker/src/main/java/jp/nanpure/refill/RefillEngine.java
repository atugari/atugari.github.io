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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

final class RefillEngine {
    private static final String HOST = "nanpure-refill.invalid";
    private static final String START = "https://" + HOST + "/index.html";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private final Context context;
    private final CompletableFuture<JSONObject> result = new CompletableFuture<>();
    private WebView view;

    RefillEngine(Context context) {
        this.context = context;
    }

    JSONObject generate(int budgetMs) throws InterruptedException, IOException, TimeoutException {
        MAIN.post(() -> load(budgetMs));
        try {
            return result.get(budgetMs + 25000L, TimeUnit.MILLISECONDS);
        } catch (ExecutionException error) {
            throw new IOException("Refill engine could not start", error.getCause());
        } finally {
            cancel();
        }
    }

    void cancel() {
        result.cancel(false);
        MAIN.post(this::destroy);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void load(int budgetMs) {
        if (result.isDone()) return;
        try {
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
                    if (START.equals(url) && !result.isDone()) {
                        webView.evaluateJavascript("runRefillRound(" + budgetMs + ")", null);
                    }
                }

                @Override public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    result.completeExceptionally(new IOException("WebView renderer stopped"));
                    destroy();
                    return true;
                }
            });
            view.loadUrl(START);
        } catch (RuntimeException error) {
            result.completeExceptionally(error);
            destroy();
        }
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private void destroy() {
        if (view == null) return;
        view.removeJavascriptInterface("RefillBridge");
        view.stopLoading();
        view.destroy();
        view = null;
    }

    public final class ResultBridge {
        @JavascriptInterface public void finish(String json) {
            if (json == null || json.length() > 300000) {
                result.completeExceptionally(new IOException("Invalid engine response size"));
                return;
            }
            try {
                result.complete(new JSONObject(json));
            } catch (JSONException error) {
                result.completeExceptionally(error);
            }
        }
    }
}

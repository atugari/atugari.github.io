package jp.atugari.wadoprint;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import org.json.JSONObject;

public class MainActivity extends Activity {
    static final String URL="https://wado.local/index.html";
    static final int OPEN_BOOK=1201, SAVE_BOOK=1202;
    WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root=new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246,245,239));
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        webView=new WebView(this);
        root.addView(webView,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
        WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setTextZoom(100);s.setSupportZoom(true);s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new Bridge(),"WadoNative");
        webView.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !isLocal(request.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                try {if(isLocal(request.getUrl())&&request.getUrl().getPath().equals("/index.html"))return new WebResourceResponse("text/html","UTF-8",getAssets().open("index.html"));}
                catch(Exception ignored) { }
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                try {startActivityForResult(i,OPEN_BOOK);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;Toast.makeText(MainActivity.this,"ファイル選択を開けませんでした。",Toast.LENGTH_LONG).show();}return true;
            }
        });
        webView.loadUrl(URL);
    }
    private boolean isLocal(Uri uri){return "https".equals(uri.getScheme())&&"wado.local".equals(uri.getHost());}
    private void result(String message){webView.evaluateJavascript("window.WadoNativeResult&&window.WadoNativeResult("+JSONObject.quote(message)+")",null);}
    final class Bridge {
        @JavascriptInterface public void exportBook(String json){
            if(json==null||json.length()>3000000)return;
            runOnUiThread(()->{
                try {JSONObject value=new JSONObject(json);if(!"wado-print".equals(value.getString("format")))return;Files.write(new File(getCacheDir(),"pending-book.json").toPath(),json.getBytes(StandardCharsets.UTF_8));Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"漢字穴埋め_問題帳_"+LocalDate.now()+".json");startActivityForResult(i,SAVE_BOOK);}
                catch(Exception e){result("保存先を開けませんでした。もう一度お試しください。");}
            });
        }
        @JavascriptInterface public void printSheet(String name){runOnUiThread(()->{if(!isLocal(Uri.parse(webView.getUrl())))return;try {PrintManager manager=(PrintManager)getSystemService(PRINT_SERVICE);manager.print(name,webView.createPrintDocumentAdapter(name),new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME).setMinMargins(new PrintAttributes.Margins(394,394,394,394)).build());}catch(Exception e){Toast.makeText(MainActivity.this,"印刷画面を開けませんでした。",Toast.LENGTH_LONG).show();}});}
    }
    @Override protected void onActivityResult(int request,int code,Intent data){
        super.onActivityResult(request,code,data);
        if(request==OPEN_BOOK&&fileCallback!=null){fileCallback.onReceiveValue(code==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
        if(request==SAVE_BOOK){if(code==RESULT_OK&&data!=null&&data.getData()!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new IllegalStateException();Files.copy(new File(getCacheDir(),"pending-book.json").toPath(),out);result("問題帳を保存しました。解答例も含まれます。");}catch(Exception e){result("保存できませんでした。保存先の空き容量を確認してください。");}}else result("ファイルへの保存をやめました。アプリ内の問題は残っています。");new File(getCacheDir(),"pending-book.json").delete();}
    }
    @Override public void onBackPressed(){webView.evaluateJavascript("window.WadoAppBack?window.WadoAppBack():false",value->{if(!"true".equals(value))MainActivity.super.onBackPressed();});}
    @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);webView.removeJavascriptInterface("WadoNative");webView.destroy();super.onDestroy();}
}

package jp.atugari.wadoprint;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.After;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PrintSmokeTest {
    WebView web;
    String js(String script)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->web.evaluateJavascript(script,value->{result.set(value);done.countDown();}));assertTrue("JavaScript callback",done.await(10,TimeUnit.SECONDS));return result.get();}
    void waitTrue(String code)throws Exception{for(int i=0;i<160;i++){if("true".equals(js(code)))return;Thread.sleep(250);}fail("Timed out: "+code);}
    @After public void retainEvidence()throws Exception{
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());File output=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
        if(output!=null){device.dumpWindowHierarchy(new File(output,"android-final-ui.xml"));device.takeScreenshot(new File(output,"android-final-ui.png"));device.executeShellCommand("mkdir -p /sdcard/Download/wado-qa");device.executeShellCommand("cp -R "+output.getAbsolutePath()+"/. /sdcard/Download/wado-qa/");}
    }
    @Test public void nativePreviewAndPrint()throws Exception{
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(a->web=a.webView);
            waitTrue("!!document.getElementById('generate')&&!document.getElementById('generate').disabled");
            js("for(const [id,value] of Object.entries({hint:'0',layout:'12',batch:'20',kanjiSize:'largest',kanjiWeight:'heavy'})){const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));}document.getElementById('generate').click()");
            waitTrue("document.getElementById('book-count').textContent==='20問'&&!document.getElementById('preview-questions').disabled");
            js("document.getElementById('preview-questions').click()");
            waitTrue("document.querySelectorAll('.page-frame').length===2&&document.querySelector('.page-frame').offsetWidth>0");
            String encoded=js("JSON.stringify({fonts:document.fonts.check('700 64px WadoPrintKanji'),pages:document.querySelectorAll('.page-frame').length,overflow:[...document.querySelectorAll('.sheet-item')].some(e=>e.scrollHeight>e.clientHeight+1),fits:(()=>{const r=document.querySelector('.page-frame').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})(),blank:[...document.querySelectorAll('.diagram')].every(e=>e.querySelectorAll('text').length===e.querySelectorAll('.arrow').length)})");
            String decoded=(String)new org.json.JSONTokener(encoded).nextValue();JSONObject checks=new JSONObject(decoded);
            File output=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
            Files.write(new File(output,"android-smoke.json").toPath(),decoded.getBytes(StandardCharsets.UTF_8));
            device.waitForIdle(1000);Thread.sleep(300);
            device.takeScreenshot(new File(output,"android-preview.png"));
            assertTrue("Bundled font loaded",checks.getBoolean("fonts"));assertFalse("No clipped questions",checks.getBoolean("overflow"));assertTrue("Whole A4 page fits phone",checks.getBoolean("fits"));assertTrue("Questions keep blank centers",checks.getBoolean("blank"));
            js("document.getElementById('print').click()");
            assertTrue("Native print UI opened",device.wait(Until.hasObject(By.pkg("com.android.printspooler")),15000));
            device.takeScreenshot(new File(output,"android-native-print.png"));
            Files.write(new File(output,"android-print-ui.xml").toPath(),"".getBytes(StandardCharsets.UTF_8));device.dumpWindowHierarchy(new File(output,"android-print-ui.xml"));
            device.pressBack();device.waitForIdle();
            js("document.getElementById('close-preview').click();document.getElementById('export').closest('details').open=true;document.getElementById('export').click()");
            assertTrue("Native save dialog opened",device.wait(Until.hasObject(By.clazz("android.widget.EditText")),10000));
            device.takeScreenshot(new File(output,"android-native-save.png"));device.pressBack();
        }
    }
}


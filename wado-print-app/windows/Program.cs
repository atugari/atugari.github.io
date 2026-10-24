using System.Reflection;
using System;
using System.IO;
using System.Drawing;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Forms;
#if NETFRAMEWORK
using System.Web.Script.Serialization;
#else
using System.Text.Json;
#endif
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WadoPrint;
internal static class Program {
 [STAThread] static void Main(string[] args){
#if NETFRAMEWORK
 Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
#else
 ApplicationConfiguration.Initialize();
#endif
 Application.Run(new MainWindow(args));}
}
internal sealed class MainWindow:Form {
 readonly WebView2 view=new(){Dock=DockStyle.Fill};
 readonly string[] args;
 readonly string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Atugari","WadoPrint");
 public MainWindow(string[] arguments){args=arguments;Text="漢字穴埋め 印刷帳 2.6.0";Width=1120;Height=850;MinimumSize=new Size(420,560);StartPosition=FormStartPosition.CenterScreen;Controls.Add(view);Shown+=async(_,_)=>await Start();}
 async Task Start(){
  try {
   Directory.CreateDirectory(root);string assets=Path.Combine(root,"assets");Directory.CreateDirectory(assets);
   using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("WadoPrint.index.html")??throw new IOException("画面データが見つかりません。"))using(var output=File.Create(Path.Combine(assets,"index.html")))await input.CopyToAsync(output);
   var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"profile"));await view.EnsureCoreWebView2Async(environment);
   view.CoreWebView2.SetVirtualHostNameToFolderMapping("wado.local",assets,CoreWebView2HostResourceAccessKind.DenyCors);
   view.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;view.CoreWebView2.Settings.IsStatusBarEnabled=false;
   view.CoreWebView2.NavigationStarting+=(_,e)=>{if(!e.Uri.StartsWith("https://wado.local/",StringComparison.Ordinal))e.Cancel=true;};
   view.CoreWebView2.NewWindowRequested+=(_,e)=>e.Handled=true;
   view.CoreWebView2.WebMessageReceived+=async(_,e)=>{try{if(!e.Source.StartsWith("https://wado.local/",StringComparison.Ordinal))return;var native=NativeJson.Parse(e.WebMessageAsJson);string? type=native.Type;if(type=="print")view.CoreWebView2.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);else if(type=="export"){string text=native.Json;if(text.Length>3000000)return;using var dialog=new SaveFileDialog{Filter="問題帳 (*.json)|*.json",FileName="漢字穴埋め_問題帳_"+DateTime.Now.ToString("yyyy-MM-dd")+".json",AddExtension=true,DefaultExt="json"};string message;if(dialog.ShowDialog(this)==DialogResult.OK){await NativeFiles.WriteText(dialog.FileName,text);message="問題帳を保存しました。解答例も含まれます。";}else message="ファイルへの保存をやめました。ソフト内の問題は残っています。";await view.CoreWebView2.ExecuteScriptAsync("window.WadoNativeResult("+NativeJson.Quote(message)+")");}}catch(Exception){MessageBox.Show(this,"操作できませんでした。保存先などを確認して、もう一度お試しください。","漢字穴埋め 印刷帳");}};
   if(args.Length==2&&args[0]=="--smoke-test")view.CoreWebView2.NavigationCompleted+=async(_,e)=>{if(e.IsSuccess)await Smoke(args[1]);};
   view.Source=new Uri("https://wado.local/index.html");
  }catch(WebView2RuntimeNotFoundException){MessageBox.Show(this,"表示に必要なMicrosoft Edge WebView2 Runtimeが見つかりません。Microsoft公式サイトでインストールしてから、もう一度起動してください。\nhttps://developer.microsoft.com/microsoft-edge/webview2/","漢字穴埋め 印刷帳",MessageBoxButtons.OK,MessageBoxIcon.Information);Environment.ExitCode=2;Close();}
  catch(Exception e){MessageBox.Show(this,"起動できませんでした。\n"+e.Message,"漢字穴埋め 印刷帳");Environment.ExitCode=3;Close();}
 }
 async Task<string> Js(string code)=>await view.CoreWebView2.ExecuteScriptAsync(code);
 async Task WaitFor(string code){for(int i=0;i<120;i++){if(await Js(code)=="true")return;await Task.Delay(250);}throw new Exception("Timed out: "+code);}
 async Task Smoke(string folder){
  try{Directory.CreateDirectory(folder);
   const string sample="漢字穴埋め・保存確認\\\"\n学・習・𠮷";
   var message=NativeJson.Parse("{\"type\":\"export\",\"json\":"+NativeJson.Quote(sample)+"}");
   if(message.Type!="export"||message.Json!=sample||NativeJson.Unquote(NativeJson.Quote(sample))!=sample||NativeJson.Parse("{\"type\":\"print\"}").Type!="print")throw new Exception("Native message roundtrip failed");
   var checkPath=Path.Combine(folder,"native-save-check.txt");await NativeFiles.WriteText(checkPath,message.Json);if(await NativeFiles.ReadText(checkPath)!=sample)throw new Exception("Native saved text changed");
   await WaitFor("!!document.getElementById('generate')&&!document.getElementById('generate').disabled");await Js("const b=document.getElementById('batch');b.value='20';b.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('generate').click()");await WaitFor("document.getElementById('book-count').textContent==='20問'&&!document.getElementById('preview-questions').disabled");
   await Js(await NativeFiles.ReadText("wado-print-app/tools/paper-smoke.js"));
   if(await Js("window.__workspaceTest()") == "null")throw new Exception("Workspace navigation test failed");
   if(await Js("window.__liveTest()") == "null")throw new Exception("Live editing test failed");
   foreach(var size in new[]{"compact","small","medium","large","largest"})foreach(var text in new[]{"normal","largest"})foreach(var kind in new[]{"questions","answers","hints"}){var check=await Js($"window.__paperTest('{size}','{text}','{kind}')");if(check=="null")throw new Exception("Automatic paper test failed: "+size+" / "+text+" / "+kind);}
   var print=view.CoreWebView2.Environment.CreatePrintSettings();print.ShouldPrintHeaderAndFooter=false;print.PageWidth=8.2677165;print.PageHeight=11.6929134;print.MarginTop=.3937008;print.MarginBottom=.3937008;print.MarginLeft=.3937008;print.MarginRight=.3937008;
   await Js("window.__paperTest('largest','largest','questions')");using(var image=File.Create(Path.Combine(folder,"windows-large-text.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);if(!await view.CoreWebView2.PrintToPdfAsync(Path.GetFullPath(Path.Combine(folder,"windows-large-text.pdf")),print))throw new Exception("Large PDF failed");
   var result=await Js("JSON.stringify(window.__paperTest('compact','normal','questions',true))");await NativeFiles.WriteText(Path.Combine(folder,"windows-smoke.json"),NativeJson.Unquote(result));using(var image=File.Create(Path.Combine(folder,"windows-preview.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);if(!await view.CoreWebView2.PrintToPdfAsync(Path.GetFullPath(Path.Combine(folder,"windows-questions.pdf")),print))throw new Exception("PDF failed");Environment.ExitCode=0;
  }catch(Exception e){await NativeFiles.WriteText(Path.Combine(folder,"windows-failure.txt"),e.ToString());Environment.ExitCode=4;}finally{Close();}
 }
}

// The compact Windows build uses the framework already supplied by Windows.
// Both packages share this host, the WebView2 profile and the complete offline UI.
internal sealed class NativeMessage {public string Type="";public string Json="";}
internal static class NativeJson {
#if NETFRAMEWORK
 static JavaScriptSerializer Serializer()=>new(){MaxJsonLength=7000000};
 public static NativeMessage Parse(string text){var data=Serializer().Deserialize<Dictionary<string,object>>(text);var type=data["type"] as string??"";return new NativeMessage{Type=type,Json=type=="export"?(data["json"] as string??""):""};}
 public static string Quote(string value)=>Serializer().Serialize(value);
 public static string Unquote(string value)=>Serializer().Deserialize<string>(value);
#else
 public static NativeMessage Parse(string text){using var doc=JsonDocument.Parse(text);var type=doc.RootElement.GetProperty("type").GetString()??"";return new NativeMessage{Type=type,Json=type=="export"?(doc.RootElement.GetProperty("json").GetString()??""):""};}
 public static string Quote(string value)=>JsonSerializer.Serialize(value);
 public static string Unquote(string value)=>JsonSerializer.Deserialize<string>(value)??"";
#endif
}
internal static class NativeFiles {
#if NETFRAMEWORK
 public static Task WriteText(string path,string text)=>Task.Run(()=>File.WriteAllText(path,text));
 public static Task<string> ReadText(string path)=>Task.Run(()=>File.ReadAllText(path));
#else
 public static Task WriteText(string path,string text)=>File.WriteAllTextAsync(path,text);
 public static Task<string> ReadText(string path)=>File.ReadAllTextAsync(path);
#endif
}

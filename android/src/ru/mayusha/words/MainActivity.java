package ru.mayusha.words;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.speech.tts.UtteranceProgressListener;
import android.util.AtomicFile;
import android.util.Base64;
import android.window.OnBackInvokedDispatcher;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public final class MainActivity extends Activity {
 private static final String HOST="words.mayusha.local";
 private static final int MAX_FILE=5*1024*1024, OPEN_FILE=10, SAVE_BACKUP=11;
 private WebView web;
 private HandwritingDialog handwriting;
 private TextToSpeech tts;
 private boolean pageReady=false,ttsReady=false,refreshVoice=false;
 private String pendingImport=null,exportBackup=null,accent="en-GB";
 private AtomicFile stateFile;
 private SharedPreferences prefs;
 private long parentUntil=0;
 private final Object stateLock=new Object();

 @Override public void onCreate(Bundle saved) {
  super.onCreate(saved);prefs=getSharedPreferences("parent",MODE_PRIVATE);stateFile=new AtomicFile(new File(getFilesDir(),"words-state.json"));
  FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(247,243,252));web=new WebView(this);web.setBackgroundColor(Color.rgb(247,243,252));
  frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
  frame.setOnApplyWindowInsetsListener((v,insets)->{
   if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}
   else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
  });frame.requestApplyInsets();
  getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
  web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMediaPlaybackRequiresUserGesture(true);
  web.getSettings().setSupportMultipleWindows(false);web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
    Uri u=r.getUrl();String p=u.getPath();
    if("https".equals(u.getScheme())&&HOST.equals(u.getHost())&&p!=null){String name=p.equals("/")?"index.html":p.substring(1);
     if(Arrays.asList("index.html","app.js","engine.js","style.css").contains(name)){
      try{return new WebResourceResponse(name.endsWith(".html")?"text/html":name.endsWith(".css")?"text/css":"application/javascript","UTF-8",getAssets().open(name));}catch(IOException ignored){}
     }
    }return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,new ByteArrayInputStream(new byte[0]));
   }
  });web.addJavascriptInterface(new Bridge(),"WordsAndroid");web.loadUrl("https://"+HOST+"/");
  initTts();handleIntent(getIntent());
  if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());
  // Expire only old export files, so a recipient can still read a recent share after resume.
  File base=new File(getCacheDir(),"exports");File[] dirs=base.listFiles();if(dirs!=null)for(File d:dirs)if(d.lastModified()<System.currentTimeMillis()-7L*86400000){File[] files=d.listFiles();if(files!=null)for(File f:files)f.delete();d.delete();}
 }
 private void js(String code){runOnUiThread(()->{if(web!=null&&!isFinishing()&&!isDestroyed()&&pageReady)web.evaluateJavascript(code,null);});}
 private void notifyUser(String message){js("window.WordsApp.notify("+JSONObject.quote(message)+")");}
 private void speechError(String message){js("window.WordsApp.onSpeechError("+JSONObject.quote(message)+")");}
 private void initTts(){
  if(tts!=null){tts.stop();tts.shutdown();}ttsReady=false;
  tts=new TextToSpeech(this,status->{ttsReady=status==TextToSpeech.SUCCESS;if(ttsReady){tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){}public void onError(String id){speechError("Не удалось озвучить слово. Проверь английский голос в настройках.");}});}reportVoice();});
 }
 private Voice chooseVoice(String tag) {
  if(!ttsReady||tts==null)return null;Set<Voice> all=tts.getVoices();if(all==null)return null;List<Voice> choices=new ArrayList<>();Locale locale=Locale.forLanguageTag(tag);
  for(Voice v:all){Set<String> f=v.getFeatures();if("en".equals(v.getLocale().getLanguage())&&!v.isNetworkConnectionRequired()&&(f==null||!f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))choices.add(v);}
  choices.sort((a,b)->{int ac=a.getLocale().getCountry().equals(locale.getCountry())?1:0,bc=b.getLocale().getCountry().equals(locale.getCountry())?1:0;int c=Integer.compare(bc,ac);if(c!=0)return c;c=Integer.compare(b.getQuality(),a.getQuality());return c!=0?c:a.getName().compareTo(b.getName());});return choices.isEmpty()?null:choices.get(0);
 }
 private void reportVoice(){
  Voice v=chooseVoice(accent);String message;
  if(!ttsReady)message="Голос ещё не готов. Если звук не появится, открой «Настроить голос».";
  else if(v==null)message="Нужен английский голос для работы без интернета. Открой «Настроить голос» и загрузи его.";
  else {boolean exact=v.getLocale().getCountry().equals(Locale.forLanguageTag(accent).getCountry());message=(exact?"Голос готов: ":"Выбранный акцент недоступен. Доступный голос: ")+v.getLocale().getDisplayName(new Locale("ru"))+". Работает без интернета.";}
  js("window.WordsApp.onVoiceStatus("+(v!=null)+","+JSONObject.quote(message)+")");
 }
 private static byte[] readLimited(InputStream in) throws IOException {
  if(in==null)throw new IOException("No stream");try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=input.read(buf))!=-1){if(out.size()+n>MAX_FILE)throw new IOException("Too large");out.write(buf,0,n);}return out.toByteArray();}
 }
 private void handleIntent(Intent intent){
  if(intent==null)return;Uri u=null;
  if(Intent.ACTION_VIEW.equals(intent.getAction()))u=intent.getData();
  else if(Intent.ACTION_SEND.equals(intent.getAction())){try{u=intent.getParcelableExtra(Intent.EXTRA_STREAM);}catch(Exception ignored){}}
  if(u!=null)readImport(u);
 }
 private void readImport(Uri uri){
  if(!"content".equals(uri.getScheme())){notifyUser("Открой файл через кнопку «Открыть файл» в наборах.");return;}
  new Thread(()->{try{String data=new String(readLimited(getContentResolver().openInputStream(uri)),StandardCharsets.UTF_8);runOnUiThread(()->{pendingImport=data;deliverImport();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Не удалось открыть файл. Сохрани его и выбери в разделе «Наборы». Размер — до 5 МБ.",Toast.LENGTH_LONG).show());}},"word-import").start();
 }
 private void deliverImport(){if(pageReady&&pendingImport!=null){String data=pendingImport;pendingImport=null;js("window.WordsApp.receiveFile("+JSONObject.quote(data)+")");}}
 @Override protected void onNewIntent(Intent i){super.onNewIntent(i);setIntent(i);handleIntent(i);}
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==OPEN_FILE&&result==RESULT_OK&&data!=null&&data.getData()!=null)readImport(data.getData());
  if(request==SAVE_BACKUP){final File pending=new File(getFilesDir(),"pending-backup.json");if(result==RESULT_OK&&data!=null&&data.getData()!=null){final Uri uri=data.getData();new Thread(()->{try{byte[] content=readLimited(new FileInputStream(pending));try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(content);}notifyUser("Резервная копия сохранена.");}catch(Exception e){notifyUser("Не удалось сохранить копию. Попробуй другую папку.");}finally{pending.delete();}},"backup-save").start();}else pending.delete();exportBackup=null;}
 }
 private void shareFile(String content,String name){
  try{File dir=new File(new File(getCacheDir(),"exports"),UUID.randomUUID().toString());if(!dir.mkdirs())throw new IOException();File f=new File(dir,name);try(FileOutputStream out=new FileOutputStream(f)){out.write(content.getBytes(StandardCharsets.UTF_8));}
   Uri uri=new Uri.Builder().scheme("content").authority(ShareProvider.AUTHORITY).appendPath(dir.getName()).appendPath(name).build();
   Intent send=new Intent(Intent.ACTION_SEND).setType("application/octet-stream");send.putExtra(Intent.EXTRA_STREAM,uri);send.putExtra(Intent.EXTRA_SUBJECT,"Набор английских слов");send.setClipData(ClipData.newRawUri("Набор слов",uri));send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
   startActivity(Intent.createChooser(send,"Отправить набор слов"));
  }catch(Exception e){notifyUser("Не удалось открыть отправку файла. Попробуй ещё раз.");}
 }
 private String hash(String pin,String salt) throws Exception {PBEKeySpec spec=new PBEKeySpec(pin.toCharArray(),Base64.decode(salt,Base64.NO_WRAP),120000,256);try{return Base64.encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(),Base64.NO_WRAP);}finally{spec.clearPassword();}}
 public final class Bridge {
  @JavascriptInterface public void openHandwriting(String request,boolean singleLetter){
   if(request==null||!request.matches("[0-9]{1,12}"))return;
   runOnUiThread(()->{if(isFinishing()||isDestroyed())return;if(handwriting!=null&&handwriting.isShowing())handwriting.dismiss();
    ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0);
    handwriting=new HandwritingDialog(MainActivity.this,singleLetter,text->js("window.WordsApp.onHandwriting("+JSONObject.quote(request)+","+JSONObject.quote(text)+")"));handwriting.show();
   });
  }
  @JavascriptInterface public String loadState(){synchronized(stateLock){try{return new String(readLimited(stateFile.openRead()),StandardCharsets.UTF_8);}catch(FileNotFoundException e){return "";}catch(Exception e){return "{\"error\":\"Не удалось прочитать сохранение\"}";}}}
  @JavascriptInterface public boolean saveState(String json){
   if(json==null||json.getBytes(StandardCharsets.UTF_8).length>MAX_FILE)return false;
   try{JSONObject data=new JSONObject(json);if(data.optInt("version")!=1||!data.has("wallet")||!data.has("decks"))return false;}catch(Exception e){return false;}
   synchronized(stateLock){FileOutputStream out=null;try{out=stateFile.startWrite();out.write(json.getBytes(StandardCharsets.UTF_8));stateFile.finishWrite(out);return true;}catch(Exception e){if(out!=null)stateFile.failWrite(out);return false;}}
  }
  @JavascriptInterface public void ready(){runOnUiThread(()->{pageReady=true;deliverImport();reportVoice();});}
  @JavascriptInterface public boolean hasPin(){return prefs.contains("hash");}
  @JavascriptInterface public synchronized boolean setPin(String pin){
   if(pin==null||!pin.matches("[0-9]{4,6}")||(prefs.contains("hash")&&System.currentTimeMillis()>parentUntil))return false;
   try{byte[] bytes=new byte[24];new SecureRandom().nextBytes(bytes);String salt=Base64.encodeToString(bytes,Base64.NO_WRAP);boolean ok=prefs.edit().putString("salt",salt).putString("hash",hash(pin,salt)).putInt("attempts",0).putLong("lockedUntil",0).commit();if(ok)parentUntil=System.currentTimeMillis()+300000;return ok;}catch(Exception e){return false;}
  }
  @JavascriptInterface public synchronized String verifyPin(String pin){
   long now=System.currentTimeMillis(),locked=prefs.getLong("lockedUntil",0);if(now<locked)return "Слишком много попыток. Подождите "+((locked-now)/1000+1)+" секунд.";
   if(pin==null||!pin.matches("[0-9]{4,6}"))return "Введите от 4 до 6 цифр.";
   try{String stored=prefs.getString("hash","");boolean match=MessageDigest.isEqual(stored.getBytes(StandardCharsets.UTF_8),hash(pin,prefs.getString("salt","")).getBytes(StandardCharsets.UTF_8));if(match){prefs.edit().putInt("attempts",0).putLong("lockedUntil",0).commit();parentUntil=now+300000;return "ok";}}catch(Exception ignored){}
   int attempts=prefs.getInt("attempts",0)+1;prefs.edit().putInt("attempts",attempts).putLong("lockedUntil",attempts%5==0?now+30000:0).commit();return attempts%5==0?"Слишком много попыток. Подождите 30 секунд.":"Неверный PIN. Попробуйте ещё раз.";
  }
  @JavascriptInterface public void lockParent(){parentUntil=0;}
  @JavascriptInterface public void speak(String word,boolean slow,String language){
   if(word==null||word.length()>100||!word.matches("[a-zA-Z ,.'’-]+"))return;
   runOnUiThread(()->{accent="en-US".equals(language)?"en-US":"en-GB";Voice v=chooseVoice(accent);if(v==null){reportVoice();speechError("Нужен английский голос. Попроси взрослого открыть «Родителям → Имя, голос и награды → Настроить голос».");return;}tts.stop();if(tts.setVoice(v)!=TextToSpeech.SUCCESS){speechError("Не удалось выбрать голос. Проверь его установку в настройках.");return;}tts.setSpeechRate(slow?.65f:.9f);tts.setPitch(1f);if(tts.speak(word,TextToSpeech.QUEUE_FLUSH,null,UUID.randomUUID().toString())==TextToSpeech.ERROR)speechError("Не удалось произнести слово. Проверь настройки голоса.");});
  }
  @JavascriptInterface public void stopSpeech(){runOnUiThread(()->{if(tts!=null)tts.stop();});}
  @JavascriptInterface public void checkVoice(String language){runOnUiThread(()->{accent="en-US".equals(language)?"en-US":"en-GB";reportVoice();});}
  @JavascriptInterface public void openSpeechSettings(){runOnUiThread(()->{refreshVoice=true;try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));}catch(Exception e){try{startActivity(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA));}catch(Exception ignored){notifyUser("Открой настройки телефона → Общие настройки → Преобразование текста в речь.");}}});}
  @JavascriptInterface public void pickFile(){runOnUiThread(()->{try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");startActivityForResult(i,OPEN_FILE);}catch(Exception e){notifyUser("Не удалось открыть выбор файла.");}});}
  @JavascriptInterface public void exportFile(String content,String name,String kind){
   if(content==null||content.getBytes(StandardCharsets.UTF_8).length>MAX_FILE||name==null||!name.matches("[a-zA-Z0-9_.-]{1,140}")||name.contains(".."))return;
   runOnUiThread(()->{if("backup".equals(kind)){if(System.currentTimeMillis()>parentUntil){notifyUser("Войди в родительский раздел ещё раз.");return;}exportBackup=content;try{try(FileOutputStream out=new FileOutputStream(new File(getFilesDir(),"pending-backup.json"))){out.write(content.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(i,SAVE_BACKUP);}catch(Exception e){exportBackup=null;notifyUser("Не удалось открыть сохранение файла.");}}else shareFile(content,name);});
  }
  @JavascriptInterface public void shareText(String text){if(text==null||text.length()>4000)return;runOnUiThread(()->{try{Intent i=new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,text);startActivity(Intent.createChooser(i,"Выбери MAX, затем маму"));}catch(Exception e){notifyUser("Не удалось открыть отправку. Просьба сохранена в истории копилки.");}});}
 }
 private void handleBack(){if(web!=null)web.evaluateJavascript("window.WordsApp ? window.WordsApp.back() : false",v->{if(!"true".equals(v))finish();});}
 @Override public void onBackPressed(){handleBack();}
 @Override protected void onPause(){parentUntil=0;if(web!=null){js("window.WordsApp.pause()");web.onPause();}if(tts!=null)tts.stop();super.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();if(refreshVoice){refreshVoice=false;initTts();}else if(tts!=null&&ttsReady)reportVoice();}
 @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);/* Large file content stays out of the Binder bundle. */}
 @Override protected void onDestroy(){if(handwriting!=null)handwriting.dismiss();if(tts!=null){tts.stop();tts.shutdown();tts=null;}if(web!=null){web.removeJavascriptInterface("WordsAndroid");web.destroy();web=null;}super.onDestroy();}
}

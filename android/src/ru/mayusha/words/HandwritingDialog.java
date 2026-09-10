package ru.mayusha.words;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import com.google.mlkit.vision.digitalink.common.RecognitionCandidate;
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import java.util.ArrayList;
import java.util.List;

/** Independent finger/stylus canvas. The model receives strokes only, never the expected answer. */
final class HandwritingDialog extends Dialog {
 interface Listener { void onText(String text); }
 interface SpeechListener { void onSpeak(boolean slow); }
 private static final int PURPLE=0xff7952ce, INK=0xff30243e, MUTED=0xff817589;
 private final Activity activity;
 private final Listener listener;
 private final boolean singleLetter;
 private final String prompt;
 private final boolean dictation;
 private final SpeechListener speech;
 private DigitalInkRecognitionModel model;
 private DigitalInkRecognizer recognizer;
 private InkView pad;
 private TextView status;
 private TextView speechStatus;
 private Button recognize;
 private LinearLayout candidates;
 private boolean ready=false,busy=false,closed=false;
 private int revision=0;

 HandwritingDialog(Activity activity,boolean singleLetter,String prompt,boolean dictation,SpeechListener speech,Listener listener) {
  super(activity);this.activity=activity;this.singleLetter=singleLetter;this.prompt=prompt;this.dictation=dictation;this.speech=speech;this.listener=listener;
 }
 private int dp(float n){return Math.round(n*activity.getResources().getDisplayMetrics().density);}
 private GradientDrawable bg(int color,int stroke){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(20));if(stroke!=0)d.setStroke(dp(1),stroke);return d;}
 private TextView text(String value,int size,int color){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,dp(6),0,dp(8));return t;}
 private Button button(String title,boolean primary,View.OnClickListener click){
  Button b=new Button(activity);b.setText(title);b.setAllCaps(false);b.setTextSize(15);b.setTextColor(primary?Color.WHITE:INK);b.setBackground(bg(primary?PURPLE:Color.WHITE,primary?0:0xffdfd5ea));b.setMinHeight(dp(48));b.setPadding(dp(12),dp(10),dp(12),dp(10));b.setOnClickListener(click);return b;
 }
 private void add(LinearLayout parent,View v){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(9);parent.addView(v,p);}
 @Override protected void onCreate(Bundle saved) {
  super.onCreate(saved);requestWindowFeature(Window.FEATURE_NO_TITLE);
  LinearLayout frame=new LinearLayout(activity);frame.setOrientation(LinearLayout.VERTICAL);frame.setPadding(dp(18),dp(12),dp(18),dp(12));frame.setBackground(bg(0xfffaf7ff,0));
  // The question is outside the scrolling ink/results section and stays visible.
  LinearLayout titleRow=new LinearLayout(activity);titleRow.setGravity(Gravity.CENTER_VERTICAL);
  TextView heading=text("Пишем рукой",21,INK);heading.setTypeface(null,android.graphics.Typeface.BOLD);titleRow.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
  Button close=button("×",false,v->dismiss());close.setContentDescription("Вернуться к заданию");close.setMinWidth(0);titleRow.addView(close,new LinearLayout.LayoutParams(dp(48),dp(48)));frame.addView(titleRow);
  LinearLayout task=new LinearLayout(activity);task.setOrientation(LinearLayout.VERTICAL);task.setPadding(dp(14),dp(6),dp(14),dp(10));task.setBackground(bg(0xffeee7fc,0));
  task.addView(text(dictation?"Мини-диктант":singleLetter?"Вставь пропущенную букву":"Напиши по-английски",14,PURPLE));
  if(dictation){
   TextView instruction=text("Послушай и напиши слово",18,INK);instruction.setTypeface(null,android.graphics.Typeface.BOLD);task.addView(instruction);
   LinearLayout audio=new LinearLayout(activity);
   Button listen=button("Послушать",false,v->{speechStatus.setVisibility(View.GONE);speech.onSpeak(false);});
   Button slow=button("Помедленнее",false,v->{speechStatus.setVisibility(View.GONE);speech.onSpeak(true);});
   LinearLayout.LayoutParams left=new LinearLayout.LayoutParams(0,-2,1);left.setMarginEnd(dp(4));audio.addView(listen,left);
   LinearLayout.LayoutParams right=new LinearLayout.LayoutParams(0,-2,1);right.setMarginStart(dp(4));audio.addView(slow,right);task.addView(audio);
  }else{
   TextView question=text(prompt,prompt.length()>70?18:26,INK);question.setTypeface(null,android.graphics.Typeface.BOLD);question.setTextIsSelectable(false);task.addView(question);
  }
  speechStatus=text("",13,MUTED);speechStatus.setVisibility(View.GONE);speechStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);task.addView(speechStatus);add(frame,task);
  LinearLayout root=new LinearLayout(activity);root.setOrientation(LinearLayout.VERTICAL);
  root.addView(text("Пиши пальцем или стилусом в одну строку.",14,MUTED));
  pad=new InkView();LinearLayout.LayoutParams paper=new LinearLayout.LayoutParams(-1,dp(175));paper.topMargin=dp(10);root.addView(pad,paper);
  LinearLayout actions=new LinearLayout(activity);actions.setOrientation(LinearLayout.HORIZONTAL);
  Button undo=button("↶ Убрать штрих",false,v->pad.undo()),clear=button("Очистить",false,v->pad.clear());
  LinearLayout.LayoutParams half=new LinearLayout.LayoutParams(0,-2,1);half.setMarginEnd(dp(5));actions.addView(undo,half);LinearLayout.LayoutParams other=new LinearLayout.LayoutParams(0,-2,1);other.setMarginStart(dp(5));actions.addView(clear,other);add(root,actions);
  status=text("Проверяем английскую модель…",14,MUTED);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);add(root,status);
  recognize=button("Подождём…",true,v->{if(ready)recognizeInk();else download();});recognize.setEnabled(false);add(root,recognize);
  candidates=new LinearLayout(activity);candidates.setOrientation(LinearLayout.VERTICAL);add(root,candidates);
  add(root,button("Вернуться к заданию",false,v->dismiss()));
  ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(false);scroll.addView(root);frame.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(frame);
  Window window=getWindow();if(window!=null){window.setBackgroundDrawableResource(android.R.color.transparent);window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);}
  setOnDismissListener(d->{closed=true;revision++;if(recognizer!=null){recognizer.close();recognizer=null;}});
  try {
   DigitalInkRecognitionModelIdentifier id=DigitalInkRecognitionModelIdentifier.fromLanguageTag("en-US");
   if(id==null)throw new IllegalStateException("English model unavailable");
   model=DigitalInkRecognitionModel.builder(id).build();
   recognizer=DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build());
   RemoteModelManager.getInstance().isModelDownloaded(model).addOnSuccessListener(downloaded->{if(closed)return;ready=downloaded;refresh();}).addOnFailureListener(e->{if(closed)return;status.setText("Не удалось проверить модель. Попробуй скачать её ещё раз с интернетом.");recognize.setText("Скачать модель");recognize.setEnabled(true);});
  }catch(Exception e){status.setText("Рукописное распознавание сейчас недоступно. Можно вернуться и ввести ответ с клавиатуры.");recognize.setVisibility(View.GONE);}
 }
 @Override protected void onStart(){super.onStart();Window w=getWindow();if(w!=null){int width=Math.min(activity.getResources().getDisplayMetrics().widthPixels-dp(24),dp(500));int height=dp(activity.getResources().getConfiguration().screenHeightDp*.92f);w.setLayout(width,height);w.setGravity(Gravity.CENTER);}}
 void showSpeechError(String message){if(closed||speechStatus==null)return;speechStatus.setText(message);speechStatus.setVisibility(View.VISIBLE);}
 private void refresh(){
  if(closed)return;recognize.setEnabled(!busy);recognize.setText(ready?"Распознать":"Скачать модель · около 20 МБ");
  status.setText(ready?"Распознай написанное и выбери свой вариант.":"Скачай модель один раз — затем можно писать без интернета.");
 }
 private void download(){
  if(busy||model==null)return;busy=true;recognize.setEnabled(false);status.setText("Скачиваем английскую модель… Нужен интернет. Это окно можно закрыть, загрузка продолжится.");
  RemoteModelManager.getInstance().download(model,new DownloadConditions.Builder().build()).addOnSuccessListener(unused->{if(closed)return;busy=false;ready=true;refresh();}).addOnFailureListener(e->{if(closed)return;busy=false;recognize.setEnabled(true);status.setText("Не удалось скачать модель. Проверь интернет и свободное место, затем попробуй снова.");});
 }
 private void edited(){revision++;candidates.removeAllViews();if(ready&&!busy)refresh();}
 private void recognizeInk(){
  if(busy||!ready||recognizer==null)return;if(pad.strokes.isEmpty()||pad.activePointer!=-1){status.setText("Сначала напиши "+(singleLetter?"букву":"слово")+" в поле и подними палец или стилус.");return;}
  final int requested=revision;
  try {
  Ink.Builder ink=Ink.builder();for(List<float[]> stroke:pad.strokes){Ink.Stroke.Builder b=Ink.Stroke.builder();for(float[] point:stroke)b.addPoint(Ink.Point.create(point[0],point[1],(long)point[2]));ink.addStroke(b.build());}
  busy=true;recognize.setEnabled(false);candidates.removeAllViews();status.setText("Распознаём почерк…");
  RecognitionContext context=HandwritingContext.forAnswer(pad.getWidth(),pad.getHeight());
  recognizer.recognize(ink.build(),context).addOnSuccessListener(result->{
   if(closed)return;busy=false;recognize.setEnabled(true);if(requested!=revision){refresh();return;}
   ArrayList<String> seen=new ArrayList<>();
   for(RecognitionCandidate candidate:result.getCandidates()){
    final String value=candidate.getText().trim();if(value.isEmpty()||value.length()>80||seen.contains(value)||singleLetter&&value.length()!=1)continue;seen.add(value);
    add(candidates,button(value+"  →",false,v->{if(requested!=revision||closed)return;listener.onText(value);dismiss();}));if(seen.size()>=3)break;
   }
   status.setText(seen.isEmpty()?"Не удалось прочитать "+(singleLetter?"букву":"слово")+". Попробуй написать чуть крупнее и разборчивее.":"Выбери написанный вариант. Если он неверный — исправь штрихи или очисти поле.");
  }).addOnFailureListener(this::recognitionFailed);
  }catch(RuntimeException|LinkageError e){recognitionFailed(e);}
 }
 private void recognitionFailed(Throwable error){
  android.util.Log.e("WordsHandwriting","Recognition failed",error);
  if(closed)return;busy=false;recognize.setEnabled(true);
  status.setText("Не удалось распознать почерк. Написанное сохранено — попробуй ещё раз или вернись к заданию.");
 }
 private final class InkView extends View {
  private final List<List<float[]>> strokes=new ArrayList<>();
  private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path drawPath=new Path();
  private int activePointer=-1,points=0;
  private final long startTime=SystemClock.uptimeMillis();
  InkView(){super(activity);setBackground(bg(Color.WHITE,0xffdfd5ea));setContentDescription("Поле для письма пальцем или стилусом");setFocusable(true);}
  void clear(){strokes.clear();activePointer=-1;points=0;edited();invalidate();}
  void undo(){if(!strokes.isEmpty()){points-=strokes.remove(strokes.size()-1).size();activePointer=-1;edited();invalidate();}}
  private void point(float x,float y,long time){if(points>=20000)return;strokes.get(strokes.size()-1).add(new float[]{Math.max(0,Math.min(getWidth(),x)),Math.max(0,Math.min(getHeight(),y)),time-startTime});points++;}
  @Override public boolean onTouchEvent(MotionEvent event){
   int action=event.getActionMasked();
   if(action==MotionEvent.ACTION_DOWN){if(points>=20000||strokes.size()>=1000){status.setText("Поле заполнено. Очисти его и напиши слово ещё раз.");return true;}activePointer=event.getPointerId(0);strokes.add(new ArrayList<>());point(event.getX(),event.getY(),event.getEventTime());getParent().requestDisallowInterceptTouchEvent(true);edited();invalidate();return true;}
   if(activePointer==-1)return true;int index=event.findPointerIndex(activePointer);if(index<0){activePointer=-1;getParent().requestDisallowInterceptTouchEvent(false);return true;}
   if(action==MotionEvent.ACTION_POINTER_UP&&event.getPointerId(event.getActionIndex())==activePointer){point(event.getX(index),event.getY(index),event.getEventTime());activePointer=-1;getParent().requestDisallowInterceptTouchEvent(false);invalidate();return true;}
   if(action==MotionEvent.ACTION_MOVE||action==MotionEvent.ACTION_UP){for(int h=0;h<event.getHistorySize();h++)point(event.getHistoricalX(index,h),event.getHistoricalY(index,h),event.getHistoricalEventTime(h));point(event.getX(index),event.getY(index),event.getEventTime());invalidate();}
   if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){if(action==MotionEvent.ACTION_CANCEL)undo();activePointer=-1;getParent().requestDisallowInterceptTouchEvent(false);if(action==MotionEvent.ACTION_UP)performClick();}
   return true;
  }
  @Override public boolean performClick(){super.performClick();return true;}
  @Override protected void onDraw(Canvas canvas){
   super.onDraw(canvas);paint.setColor(0xffe9e0f4);paint.setStrokeWidth(dp(1));canvas.drawLine(dp(12),getHeight()*.72f,getWidth()-dp(12),getHeight()*.72f,paint);
   if(strokes.isEmpty()){paint.setColor(0xffb3a4c1);paint.setTextSize(dp(19));canvas.drawText(singleLetter?"Буква здесь":"Слово здесь",dp(18),getHeight()*.45f,paint);}
   paint.setColor(PURPLE);paint.setStrokeWidth(dp(3));paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
   for(List<float[]> stroke:strokes){if(stroke.isEmpty())continue;float[] first=stroke.get(0);if(stroke.size()==1){canvas.drawPoint(first[0],first[1],paint);continue;}Path path=drawPath;path.reset();path.moveTo(first[0],first[1]);for(int i=1;i<stroke.size();i++){float[] p=stroke.get(i);path.lineTo(p[0],p[1]);}paint.setStyle(Paint.Style.STROKE);canvas.drawPath(path,paint);paint.setStyle(Paint.Style.FILL);}
  }
 }
}

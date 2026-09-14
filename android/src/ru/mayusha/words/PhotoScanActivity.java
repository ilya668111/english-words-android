package ru.mayusha.words;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Color;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.widget.*;
import android.graphics.drawable.GradientDrawable;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.*;
import java.util.UUID;

/** Бесплатное распознавание печатной латиницы; фотография не отправляется в сеть. */
public final class PhotoScanActivity extends Activity {
 private static final int PICK=21, CAMERA=22;
 private TextView status; private Button gallery,camera; private String cameraName;
 private boolean busy; private TextRecognizer recognizer;
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 @Override public void onCreate(Bundle state){
  super.onCreate(state);if(state!=null)cameraName=state.getString("camera");
  LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(24),dp(40),dp(24),dp(24));box.setBackgroundColor(Color.rgb(247,243,252));
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(box);setContentView(scroll);
  scroll.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i;});
  TextView title=new TextView(this);title.setText("Набор по фотографии");title.setTextSize(28);title.setTextColor(Color.rgb(47,36,65));box.addView(title);
  status=new TextView(this);status.setTextSize(18);status.setPadding(0,dp(24),0,dp(24));status.setText("Сфотографируй печатный список английских слов крупно и при хорошем освещении. После распознавания проверь слова и добавь переводы.");box.addView(status);
  gallery=button(box,"Выбрать фотографию");camera=button(box,"Сделать фотографию");Button cancel=button(box,"Вернуться к наборам");
  gallery.setOnClickListener(v->{try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"),PICK);}catch(Exception e){error("Не удалось открыть фотографии.");}});
  camera.setOnClickListener(v->{try{cleanup();cameraName=UUID.randomUUID()+".jpg";File f=PhotoProvider.file(this,cameraName);if(!f.createNewFile())throw new IOException();Uri uri=Uri.parse("content://ru.mayusha.words.photos/"+cameraName);Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,uri);i.setClipData(ClipData.newRawUri("Фотография",uri));i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(i,CAMERA);}catch(Exception e){cleanup();error("Не удалось открыть камеру. Можно выбрать готовую фотографию.");}});
  cancel.setOnClickListener(v->finish());
 }
 private Button button(LinearLayout box,String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextSize(18);b.setTextColor(Color.rgb(88,61,139));GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(236,227,250));bg.setCornerRadius(dp(22));b.setBackground(bg);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(64));p.bottomMargin=dp(16);box.addView(b,p);return b;}
 private void error(String message){busy=false;gallery.setEnabled(true);camera.setEnabled(true);status.setText(message);}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(result!=RESULT_OK){if(request==CAMERA)cleanup();return;}Uri uri=request==CAMERA&&cameraName!=null?Uri.parse("content://ru.mayusha.words.photos/"+cameraName):data==null?null:data.getData();if(uri!=null&&"content".equals(uri.getScheme()))scan(uri);else error("Не удалось открыть фотографию.");}
 private void scan(Uri uri){
  if(busy)return;busy=true;gallery.setEnabled(false);camera.setEnabled(false);status.setText("Читаем английские слова…");
  new Thread(()->{Bitmap bitmap=null;try{
   byte[] bytes;try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){if(in==null)throw new IOException();byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>25*1024*1024)throw new IOException();out.write(buf,0,n);}bytes=out.toByteArray();}
   BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,o);if(o.outWidth<=0||o.outHeight<=0)throw new IOException();o.inSampleSize=1;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>2400)o.inSampleSize*=2;o.inJustDecodeBounds=false;bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,o);if(bitmap==null)throw new IOException();
   int orientation=new ExifInterface(new ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION,1);Matrix m=new Matrix();switch(orientation){case 2:m.setScale(-1,1);break;case 3:m.setRotate(180);break;case 4:m.setScale(1,-1);break;case 5:m.setRotate(90);m.postScale(-1,1);break;case 6:m.setRotate(90);break;case 7:m.setRotate(270);m.postScale(-1,1);break;case 8:m.setRotate(270);break;}if(!m.isIdentity()){Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),m,true);if(rotated!=bitmap)bitmap.recycle();bitmap=rotated;}
   final Bitmap image=bitmap;runOnUiThread(()->{if(isFinishing()||isDestroyed()){image.recycle();return;}recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);final TextRecognizer client=recognizer;try{client.process(InputImage.fromBitmap(image,0)).addOnSuccessListener(text->{if(!isFinishing()&&!isDestroyed()){String value=text.getText();if(value.length()>30000){error("На фото слишком много текста. Сфотографируй только список слов.");return;}setResult(RESULT_OK,new Intent().putExtra("text",value));finish();}}).addOnFailureListener(e->{if(!isFinishing()&&!isDestroyed())error("Не получилось прочитать фото. Попробуй снять список крупнее и без бликов.");}).addOnCompleteListener(t->{image.recycle();client.close();if(recognizer==client)recognizer=null;cleanup();});}catch(Exception e){image.recycle();client.close();recognizer=null;error("Не получилось распознать фотографию.");}});
  }catch(Exception|OutOfMemoryError e){if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle();runOnUiThread(()->{cleanup();if(!isFinishing()&&!isDestroyed())error("Не удалось прочитать фото. Выбери изображение до 25 МБ или сделай новый снимок.");});}},"photo-recognition").start();
 }
 private void cleanup(){if(cameraName!=null){try{PhotoProvider.file(this,cameraName).delete();}catch(Exception ignored){}cameraName=null;}}
 @Override protected void onSaveInstanceState(Bundle b){super.onSaveInstanceState(b);b.putString("camera",cameraName);}
 @Override protected void onDestroy(){if(isFinishing())cleanup();super.onDestroy();}
}

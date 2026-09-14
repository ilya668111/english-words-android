package ru.mayusha.words;
import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
/** Камера получает доступ только к одному временному снимку по выданному URI. */
public final class PhotoProvider extends ContentProvider {
 static File file(Context c,String name)throws IOException{if(name==null||!name.matches("[a-f0-9-]{36}\\.jpg"))throw new IOException();File dir=new File(c.getCacheDir(),"photos");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException();return new File(dir,name);}
 public boolean onCreate(){return true;}
 public String getType(Uri u){return "image/jpeg";}
 public ParcelFileDescriptor openFile(Uri u,String mode)throws FileNotFoundException{try{if(u.getPathSegments().size()!=1)throw new IOException();int flags;if("r".equals(mode))flags=ParcelFileDescriptor.MODE_READ_ONLY;else if("w".equals(mode)||"wt".equals(mode)||"rw".equals(mode)||"rwt".equals(mode))flags=ParcelFileDescriptor.MODE_READ_WRITE|ParcelFileDescriptor.MODE_TRUNCATE;else throw new IOException();return ParcelFileDescriptor.open(file(getContext(),u.getLastPathSegment()),flags);}catch(IOException e){throw new FileNotFoundException();}}
 public Cursor query(Uri u,String[] projection,String s,String[] args,String sort){try{File f=file(getContext(),u.getLastPathSegment());MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{f.getName(),f.length()});return c;}catch(IOException e){return null;}}
 public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}

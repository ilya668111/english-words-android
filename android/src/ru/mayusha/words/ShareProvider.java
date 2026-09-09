package ru.mayusha.words;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Read-only, URI-granted access to generated exports only. No arbitrary paths. */
public final class ShareProvider extends ContentProvider {
 public static final String AUTHORITY="ru.mayusha.words.files";
 @Override public boolean onCreate(){return true;}
 private File resolve(Uri uri) throws FileNotFoundException {
  if(!"content".equals(uri.getScheme())||!AUTHORITY.equals(uri.getAuthority())||uri.getPathSegments().size()!=2)throw new FileNotFoundException();
  String token=uri.getPathSegments().get(0),name=uri.getPathSegments().get(1);
  if(!token.matches("[a-f0-9-]{36}")||!name.matches("[a-zA-Z0-9_.-]{1,140}")||name.contains(".."))throw new FileNotFoundException();
  try{
   File base=new File(getContext().getCacheDir(),"exports").getCanonicalFile();
   File file=new File(new File(base,token),name).getCanonicalFile();
   if(!file.getPath().startsWith(base.getPath()+File.separator)||!file.isFile())throw new FileNotFoundException();return file;
  }catch(IOException e){throw new FileNotFoundException();}
 }
 @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
  if(!"r".equals(mode))throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.MODE_READ_ONLY);
 }
 @Override public String getType(Uri uri){return "application/octet-stream";}
 @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
  try{File f=resolve(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor c=new MatrixCursor(columns);Object[] values=new Object[columns.length];for(int i=0;i<columns.length;i++){if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))values[i]=f.getName();else if(OpenableColumns.SIZE.equals(columns[i]))values[i]=f.length();}c.addRow(values);return c;}catch(FileNotFoundException e){return null;}
 }
 @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
 @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
 @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}

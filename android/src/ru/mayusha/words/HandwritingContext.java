package ru.mayusha.words;

import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import com.google.mlkit.vision.digitalink.recognition.WritingArea;

/** Each answer starts on an empty canvas; no expected answer is supplied to ML Kit. */
final class HandwritingContext {
 private HandwritingContext() {}

 static RecognitionContext forAnswer(int width,int height) {
  if(width<=0||height<=0)throw new IllegalArgumentException("Writing area is not laid out");
  // ML Kit 19 requires preContext even for an isolated word. Omitting it throws
  // synchronously from build(), before a recognition Task/failure listener exists.
  return RecognitionContext.builder()
   .setPreContext("")
   .setWritingArea(new WritingArea(width,height))
   .build();
 }
}

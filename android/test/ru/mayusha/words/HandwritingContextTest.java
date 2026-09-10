package ru.mayusha.words;

import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import org.junit.Test;
import static org.junit.Assert.*;

public class HandwritingContextTest {
 @Test public void standaloneAnswerBuildsWithRealMlKitAndNoAnswerHint() {
  // Executes the real ML Kit builder. In 1.3 this threw
  // IllegalStateException: Missing required properties: preContext.
  RecognitionContext context=HandwritingContext.forAnswer(800,500);
  assertEquals("",context.getPreContext());
  assertEquals(800f,context.getWritingArea().getWidth(),0f);
  assertEquals(500f,context.getWritingArea().getHeight(),0f);
 }
 @Test(expected=IllegalArgumentException.class)
 public void unmeasuredCanvasIsRejectedBeforeRecognition(){
  HandwritingContext.forAnswer(0,500);
 }
}

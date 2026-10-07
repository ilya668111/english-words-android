package ru.mayusha.words;
import android.text.InputType;
import org.junit.Test;
import static org.junit.Assert.*;
public class AnswerKeyboardTest {
 @Test public void suppressesCorrectionWithoutChangingKeyboardClass(){
  int result=AnswerKeyboard.withoutSuggestions(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_AUTO_CORRECT|InputType.TYPE_TEXT_FLAG_AUTO_COMPLETE);
  assertEquals(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,result);
  assertEquals(InputType.TYPE_CLASS_NUMBER,AnswerKeyboard.withoutSuggestions(InputType.TYPE_CLASS_NUMBER));
 }
}

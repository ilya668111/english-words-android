package ru.mayusha.words;

import android.text.InputType;
import android.view.inputmethod.EditorInfo;

final class AnswerKeyboard {
 static void configure(EditorInfo info) {
  info.inputType=withoutSuggestions(info.inputType);
  info.imeOptions |= EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
 }
 static int withoutSuggestions(int type){
  if((type & InputType.TYPE_MASK_CLASS)!=InputType.TYPE_CLASS_TEXT)return type;
  type &= ~(InputType.TYPE_TEXT_FLAG_AUTO_CORRECT | InputType.TYPE_TEXT_FLAG_AUTO_COMPLETE);
  return type | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
 }
}

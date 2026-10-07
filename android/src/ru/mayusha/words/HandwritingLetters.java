package ru.mayusha.words;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Ambiguity is resolved by the learner, never using the expected answer. */
final class HandwritingLetters {
 static List<String> variants(List<String> raw) {
  ArrayList<String> result=new ArrayList<>();
  for(String text:raw){
   String value=text.trim().toLowerCase(Locale.ROOT);
   if(value.equals("i")||value.equals("l")||value.equals("1")||value.equals("|")){
    if(!result.contains("l"))result.add("l");
    if(!result.contains("i"))result.add("i");
   }else if(value.matches("[a-z]")&&!result.contains(value))result.add(value);
  }
  return result;
 }
 static String label(String value){
  String[] names={"эй","би","си","ди","и","эф","джи","эйч","ай","джей","кей","эл","эм","эн","оу","пи","кью","ар","эс","ти","ю","ви","дабл-ю","экс","уай","зед"};
  return value.toUpperCase(Locale.ROOT)+" "+value+" — буква «"+names[value.charAt(0)-'a']+"»";
 }
}

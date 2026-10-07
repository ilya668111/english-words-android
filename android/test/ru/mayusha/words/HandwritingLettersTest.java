package ru.mayusha.words;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
public class HandwritingLettersTest {
 @Test public void ambiguousStrokeOffersBothNamedLetters(){
  assertEquals(Arrays.asList("l","i"),HandwritingLetters.variants(Arrays.asList("I","l","1","|")));
  assertTrue(HandwritingLetters.label("l").contains("эл"));
  assertTrue(HandwritingLetters.label("i").contains("ай"));
 }
 @Test public void casesAreDeduplicatedAndWordsExcluded(){
  assertEquals(Arrays.asList("a","b"),HandwritingLetters.variants(Arrays.asList("A","a","B","Brazil","")));
 }
}

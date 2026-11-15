package dev.voyage.workbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class SyncSafetyTest {
 @Test public void losslessWorldExtractionAndSaveRecoveryDoNotTurnUncertainWritesIntoRetries()throws Exception{
  String world="{\"shortId\":\"WORLD\",\"initialGameState\":{\"exact\":90071992547409931234,\"scale\":1.2300e+42,\"text\":\"a \\\"world\\\" } [ \\\\ token\",\"list\":[{\"x\":1}]}}";
  assertEquals(world,SyncJson.world("{\"data\":{\"note\":\"not a world: }\",\"world\":"+world+",\"savedVersion\":{\"heroesVersion\":37}}}"));
  assertEquals("1.2300e+42",SyncJson.field(SyncJson.field(world,"initialGameState"),"scale"));
  assertThrows(Exception.class,()->SyncJson.world("{\"other\":{}}"));
  assertEquals("unknown",SyncPolicy.recovered("sending"));assertEquals("rejected",SyncPolicy.recovered("validating"));assertEquals("acknowledged",SyncPolicy.recovered("acknowledged"));
  for(String state:new String[]{"sending","unknown","acknowledged"}){assertFalse(SyncPolicy.canDiscard(state));assertTrue(SyncPolicy.canReadBack(state));}
  for(String state:new String[]{"prepared","validating","rejected"}){assertTrue(SyncPolicy.canDiscard(state));assertFalse(SyncPolicy.canReadBack(state));}
  assertTrue(SyncPolicy.revision("\"revision-9\""));for(String value:new String[]{"*","\"*\"","revision","\"bad,revision\"","\"bad\\revision\"","\"bad\nrevision\""})assertFalse(SyncPolicy.revision(value));
 }
}

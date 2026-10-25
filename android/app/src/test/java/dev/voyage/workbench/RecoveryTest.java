package dev.voyage.workbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class RecoveryTest {
 @Test public void authoredProposalContentIsNotAnAuthenticationFailure()throws Exception {
  Recovery budget=new Recovery(true,1);
  assertEquals(1,budget.correctiveOpportunity(new Exception("Select a path inside authored world content; use wholeWorld for its root.")));
  for(String message:new String[]{"Authentication failed","Authorization required","Unauthorized","Auth failed"})assertFalse(Recovery.eligible(new Exception(message)));
 }
 @Test public void initialFailureGrantsThreeCorrectiveOpportunities()throws Exception {
  Recovery budget=new Recovery(true,3);
  for(int number=1;number<=3;number++)assertEquals(number,budget.correctiveOpportunity(new Exception("Invalid JSON")));
  try{budget.correctiveOpportunity(new Exception("Invalid JSON"));fail("Expected exhaustion");}catch(Exception exhausted){assertTrue(exhausted.getMessage().contains("exhausted after 3 corrective opportunities"));}
 }

 @Test public void configuredBoundsAndDisabledRecoveryAreEnforced()throws Exception {
  for(int limit:new int[]{1,10}){
   Recovery budget=new Recovery(true,limit);
   for(int number=1;number<=limit;number++)assertEquals(number,budget.correctiveOpportunity(new Exception("Missing required field")));
   try{budget.correctiveOpportunity(new Exception("Missing required field"));fail("Expected exhaustion");}catch(Exception exhausted){assertTrue(exhausted.getMessage().contains("exhausted after "+limit));}
  }
  try{new Recovery(false,3).correctiveOpportunity(new Exception("Invalid JSON"));fail("Expected disabled recovery");}catch(Exception disabled){assertTrue(disabled.getMessage().contains("recovery is disabled"));}
  for(int limit:new int[]{0,11})try{new Recovery(true,limit);fail("Expected bounds rejection");}catch(IllegalArgumentException expected){}
 }

 @Test public void terminalScopeAndTransportErrorsNeverConsumeOpportunities()throws Exception {
  Recovery budget=new Recovery(true,1);
  for(String message:new String[]{"Task stopped","Task canceled","Task no longer exists","Task interrupted","Task timed out","Unapproved provider request","Tool is unavailable for this stage","This task is read only","This path is outside the approved Work Order scope.","Review and explicitly approve the Work Order scope for the current world before execution.","The approved Work Order scope is malformed.","The frozen Work Order source changed.","Package metadata id is read only.","Provider HTTP 429","Network failed","Permission denied","Sign into Codex"}){
   Exception failure=new Exception(message);
   try{budget.correctiveOpportunity(failure);fail(message);}catch(Exception terminal){assertSame(failure,terminal);}
  }
  Exception failure=new java.io.IOException("Connection lost");
  try{budget.correctiveOpportunity(failure);fail("Expected IO failure");}catch(Exception terminal){assertSame(failure,terminal);}
  assertEquals(1,budget.correctiveOpportunity(new Exception("Invalid JSON")));
 }
}

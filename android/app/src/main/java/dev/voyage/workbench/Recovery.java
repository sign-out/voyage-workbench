package dev.voyage.workbench;

import java.util.regex.Pattern;

final class Recovery {
 private static final Pattern FATAL=Pattern.compile("cancel|abort|timed? out|stopp?ed|interrupt|no longer|attempt.*exist|outside.*scope|frozen.*changed|approved.*scope|approve.*scope|scope.*malformed|sign.?in|\\bauth\\b|authentication|authorization|unauthorized|credential|permission|HTTP\\s*\\d|network|transport|fetch failed|unavailable for this stage|read only|unapproved provider request",Pattern.CASE_INSENSITIVE);
 final boolean enabled;
 final int maxAttempts;
 private int attempts;

 Recovery(boolean enabled,int maxAttempts){
  if(maxAttempts<1||maxAttempts>10)throw new IllegalArgumentException("Assistant recovery maxAttempts must be an integer from 1 to 10.");
  this.enabled=enabled;this.maxAttempts=maxAttempts;
 }

 synchronized int correctiveOpportunity(Exception failure)throws Exception {
  if(!eligible(failure))throw failure;
  String reason=String.valueOf(failure.getMessage());
  if(!enabled)throw new Exception("Assistant recovery is disabled. Review the failure and restart explicitly: "+reason,failure);
  if(attempts>=maxAttempts)throw new Exception("Assistant recovery exhausted after "+attempts+" corrective opportunities. Review partial changes and the approved Work Order, fix the issue, then restart explicitly: "+reason,failure);
  return ++attempts;
 }

 static boolean eligible(Exception failure){String message=String.valueOf(failure.getMessage());return !(failure instanceof java.io.IOException)&&(message.startsWith("Section checkpoint failed after ")||message.startsWith("Error: Section checkpoint failed after ")||!FATAL.matcher(message).find());}
}

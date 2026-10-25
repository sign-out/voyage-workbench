package dev.voyage.workbench;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class VoyageHttpPolicy {
 static final int MAX_ATTEMPTS=3;
 static final long BUDGET_MS=45000,MAX_WAIT_MS=5000;
 interface Clock { long elapsedMillis(); long wallMillis(); }
 interface Sleeper { void sleep(long millis)throws InterruptedException; }
 interface Connections { HttpURLConnection open(String url)throws IOException; }
 interface ErrorCode { String read(String text); }
 static final class Response {
  final int status;final String text,etag,retryAfter,code;
  Response(int status,String text,String etag,String retryAfter,String code){this.status=status;this.text=text;this.etag=etag;this.retryAfter=retryAfter;this.code=code;}
 }
 private final Clock clock;
 private final Sleeper sleeper;
 private final Connections connections;
 private final long budgetMillis;
 VoyageHttpPolicy(){this(new Clock(){public long elapsedMillis(){return System.nanoTime()/1000000;}public long wallMillis(){return System.currentTimeMillis();}},Thread::sleep,url->(HttpURLConnection)new URL(url).openConnection(),BUDGET_MS);}
 VoyageHttpPolicy(Clock clock,Sleeper sleeper,Connections connections,long budgetMillis){this.clock=clock;this.sleeper=sleeper;this.connections=connections;this.budgetMillis=budgetMillis;}

 Response execute(String method,String url,Map<String,String> headers,byte[] body,ErrorCode errorCode)throws IOException,InterruptedException {
  long deadline=clock.elapsedMillis()+budgetMillis;
  Thread caller=Thread.currentThread();
  AtomicReference<HttpURLConnection> active=new AtomicReference<>();
  ScheduledExecutorService guard=Executors.newSingleThreadScheduledExecutor(task->{Thread thread=new Thread(task,"voyage-http-deadline");thread.setDaemon(true);return thread;});
  guard.scheduleAtFixedRate(()->{if(caller.isInterrupted()||clock.elapsedMillis()>=deadline){HttpURLConnection connection=active.get();if(connection!=null)connection.disconnect();}},25,25,TimeUnit.MILLISECONDS);
  try {
   for(int attempt=1;;attempt++){
    check(deadline);
    Response response;
    try{response=exchange(method,url,headers,body,errorCode,deadline,active);}
    catch(IOException failure){
     check(deadline);
     if(failure instanceof InterruptedIOException&&!(failure instanceof SocketTimeoutException)){caller.interrupt();throw failure;}
     if(!"GET".equals(method))throw new IOException("Voyage transport failed; the write outcome may be unknown. Reconcile the live world and Studio state before retrying; keep the original idempotency key and do not create a replacement key.",failure);
     if(failure instanceof ResponseReadFailure||attempt>=MAX_ATTEMPTS)throw failure;
     long delay=500L<<(attempt-1);
     if(delay>=deadline-clock.elapsedMillis())throw failure;
     pause(delay,deadline);
     continue;
    }
    check(deadline);
    if(!retryable(method,response.status,response.code)||attempt>=MAX_ATTEMPTS)return response;
    if(response.status==429&&response.retryAfter==null)return response;
    long delay=retryDelay(response.retryAfter,clock.wallMillis(),attempt);
    if(delay<0||delay>MAX_WAIT_MS||delay>=deadline-clock.elapsedMillis())return response;
    pause(delay,deadline);
   }
  } finally {guard.shutdownNow();}
 }
 private void pause(long delay,long deadline)throws InterruptedException,SocketTimeoutException {
  check(deadline);
  try{sleeper.sleep(delay);}catch(InterruptedException cancelled){Thread.currentThread().interrupt();throw cancelled;}
  check(deadline);
 }
 private void check(long deadline)throws InterruptedException,SocketTimeoutException {
  if(Thread.currentThread().isInterrupted())throw new InterruptedException("Voyage request cancelled; no automatic retry was sent.");
  if(clock.elapsedMillis()>=deadline)throw new SocketTimeoutException("Voyage request exceeded the 45-second overall budget. For a write, reconcile the live world and Studio state before retrying; do not create a new idempotency key.");
 }
 private int timeout(long deadline,int cap)throws InterruptedException,SocketTimeoutException {check(deadline);return (int)Math.max(1,Math.min(cap,deadline-clock.elapsedMillis()));}
 private Response exchange(String method,String url,Map<String,String> headers,byte[] body,ErrorCode errorCode,long deadline,AtomicReference<HttpURLConnection> active)throws IOException,InterruptedException {
  HttpURLConnection connection=connections.open(url);
  active.set(connection);
  try {
   connection.setRequestMethod(method);
   connection.setInstanceFollowRedirects(false);
   connection.setConnectTimeout(timeout(deadline,20000));
   connection.setReadTimeout(timeout(deadline,45000));
   for(Map.Entry<String,String> header:headers.entrySet())connection.setRequestProperty(header.getKey(),header.getValue());
   if(body!=null){connection.setDoOutput(true);connection.setFixedLengthStreamingMode(body.length);try(OutputStream output=connection.getOutputStream()){check(deadline);output.write(body);}}
   connection.setReadTimeout(timeout(deadline,45000));
   int status=connection.getResponseCode();
   connection.setReadTimeout(timeout(deadline,45000));
   InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();
   if(input!=null)try(InputStream stream=input){byte[] buffer=new byte[8192];for(;;){connection.setReadTimeout(timeout(deadline,45000));int count=stream.read(buffer);check(deadline);if(count<0)break;bytes.write(buffer,0,count);}}catch(IOException failure){if(failure instanceof InterruptedIOException&&!(failure instanceof SocketTimeoutException))throw failure;if(status>=400)throw new ResponseReadFailure(failure);throw failure;}
   String text=new String(bytes.toByteArray(),StandardCharsets.UTF_8);
   return new Response(status,text,connection.getHeaderField("ETag"),connection.getHeaderField("Retry-After"),errorCode.read(text));
  } finally {active.compareAndSet(connection,null);connection.disconnect();}
 }
 private static final class ResponseReadFailure extends IOException {ResponseReadFailure(IOException cause){super("Voyage error response could not be read; automatic retry stopped because its safety code is unknown.",cause);}}
 static boolean cleanRejection(int status,String code){
  if("request_status_unknown".equals(code)||"request_in_progress".equals(code))return false;
  return "studio_unavailable".equals(code)||"studio_version_mismatch".equals(code)||status==400||status==401||status==403||status==404||status==405||status==412||status==413||status==415||status==422||status==428||status==429;
 }
 static boolean retryable(String method,int status,String code){
  if(!"GET".equals(method)||"request_status_unknown".equals(code)||"request_in_progress".equals(code)||"studio_version_mismatch".equals(code))return false;
  return status==408||status==429||status==500||status==502||status==503||status==504;
 }
 static long retryDelay(String header,long now,int attempt){
  if(header==null)return 500L<<(attempt-1);
  String value=header.trim();
  if(value.matches("[0-9]+")){try{return Math.multiplyExact(Long.parseLong(value),1000L);}catch(ArithmeticException|NumberFormatException overflow){return Long.MAX_VALUE;}}
  if(!value.matches("(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT"))return -1;
  for(String pattern:new String[]{"EEE, dd MMM yyyy HH:mm:ss 'GMT'"}){
   SimpleDateFormat format=new SimpleDateFormat(pattern,Locale.US);format.setTimeZone(TimeZone.getTimeZone("GMT"));format.setLenient(false);
   ParsePosition position=new ParsePosition(0);java.util.Date parsed=format.parse(value,position);
   if(parsed!=null&&position.getIndex()==value.length()&&format.format(parsed).equals(value))return Math.max(0,parsed.getTime()-now);
  }
  return -1;
 }
 static String errorMessage(int status,String code,String message,String requestId,String retryAfter){return errorMessage(status,code,message,requestId,retryAfter,System.currentTimeMillis());}
 static String errorMessage(int status,String code,String message,String requestId,String retryAfter,long now){
  String guidance="";
  if("request_status_unknown".equals(code))guidance="The mutation may have completed. Reconcile the live world and Studio state before any retry; do not create new idempotency keys. The existing key remains protected for the full 24-hour replay window.";
  else if("request_in_progress".equals(code))guidance="The request is still protected for the 24-hour replay window. Recheck only after the server cooldown; Retry-After is not a key-expiry promise. Do not send another mutation or create a new key.";
  else if("studio_version_mismatch".equals(code))guidance="Not retryable. Open the world in the selected environment's Creator Studio to confirm an upgrade for an older world, or explicitly choose a compatible environment for a newer draft. Never modify version fields or automatically switch hosts.";
  else if(status==401||status==403||"creator_api_access_required".equals(code))guidance="Check the Creator API key in the selected environment's Studio → Settings → API keys, its scopes, account eligibility and Creator API access; world access is owner-only. Enable access or contact Voyage support with the request ID. Local editing remains available.";
  else if("studio_unavailable".equals(code))guidance="Clean availability failure: no state reconciliation is required for this failure. After the cooldown, explicitly retry the identical request with the same idempotency key, if present. Repeated failures should be escalated with the request ID; no mutation was automatically retried.";
  else if(status==429)guidance="Rate limit reached. Wait for the server cooldown or daily-limit reset before explicitly retrying; do not rotate keys or switch hosts to bypass limits.";
  else if(status==409||status==412||status==428)guidance="No automatic retry. Refresh and reconcile the live world/revision before preparing another write.";
  else if(status>=500)guidance="For a write, the outcome may be uncertain. Reconcile the live world and Studio state before retrying; keep the original idempotency key.";
  String timing="";
  if(status==429&&retryAfter==null)timing=" Voyage did not supply a cooldown; automatic retry stopped. Check the rate-limit or daily-limit reset before retrying.";
  if(retryAfter!=null){long delay=retryDelay(retryAfter,now,1);timing=" Retry-After: "+sanitize(retryAfter,120)+".";if(delay<0||delay>8640000000000000L-now)timing+=" Voyage supplied an invalid cooldown; check again later.";else timing+=" Retry no earlier than "+new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.ofEpochMilli(now+delay))+". Delays over 5 seconds are not waited automatically.";}
  String cleanId=sanitizeId(requestId,80),cleanCode=sanitizeId(code,100);
  return "Voyage HTTP "+status+(cleanCode.isEmpty()?"":" ("+cleanCode+")")+": "+sanitize(message,500)+(guidance.isEmpty()?"":" "+guidance)+timing+(cleanId.isEmpty()?"":" Request ID: "+cleanId+".");
 }
 private static String sanitize(String value,int max){String clean=value==null?"":value.replaceAll("[\\p{Cntrl}]"," ");return clean.substring(0,Math.min(max,clean.length()));}
 private static String sanitizeId(String value,int max){String clean=value==null?"":value.replaceAll("[^a-zA-Z0-9_-]","");return clean.substring(0,Math.min(max,clean.length()));}
}

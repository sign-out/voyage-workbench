package dev.voyage.workbench;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

public class VoyageHttpPolicyTest {
 static final class Time implements VoyageHttpPolicy.Clock,VoyageHttpPolicy.Sleeper {
  long elapsed,wall=1792843200000L;final List<Long> waits=new ArrayList<>();
  public long elapsedMillis(){return elapsed;}
  public long wallMillis(){return wall;}
  public void sleep(long millis){waits.add(millis);elapsed+=millis;wall+=millis;}
 }
 static class Connection extends HttpURLConnection {
  int status=503;String text="",retryAfter;IOException failure;boolean disconnected;long elapsedOnResponse;Time clock;
  final ByteArrayOutputStream output=new ByteArrayOutputStream();
  Connection()throws Exception{super(new URL("https://example.invalid/creator/v1/worlds"));}
  public void connect(){}
  public boolean usingProxy(){return false;}
  public void disconnect(){disconnected=true;}
  public int getResponseCode()throws IOException{if(clock!=null)clock.elapsed+=elapsedOnResponse;if(failure!=null)throw failure;return status;}
  public InputStream getInputStream()throws IOException{return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));}
  public InputStream getErrorStream(){try{return getInputStream();}catch(IOException failure){throw new AssertionError(failure);}}
  public OutputStream getOutputStream(){return output;}
  public String getHeaderField(String name){return "Retry-After".equals(name)?retryAfter:"ETag".equals(name)?"\"revision\"":null;}
 }
 static final class Harness {
  final Time time=new Time();final List<Connection> opened=new ArrayList<>();final List<Connection> pending=new ArrayList<>();
  VoyageHttpPolicy policy=new VoyageHttpPolicy(time,time,url->{Connection next=pending.remove(0);opened.add(next);return next;},45000);
  Connection add(int status,String code,String retryAfter)throws Exception{Connection connection=new Connection();connection.status=status;connection.text=code;connection.retryAfter=retryAfter;connection.clock=time;pending.add(connection);return connection;}
  VoyageHttpPolicy.Response run(String method)throws Exception{return policy.execute(method,"https://example.invalid/creator/v1/worlds",headers(),null,text->text);}
 }
 static Map<String,String> headers(){Map<String,String> headers=new LinkedHashMap<>();headers.put("Accept","application/json");headers.put("Authorization","Bearer test-only");headers.put("If-Match","\"revision\"");headers.put("Idempotency-Key","original-key");return headers;}

 @Test public void retryableStatusesHaveExactlyThreeAttemptsAndExponentialWaits()throws Exception {
  for(int status:new int[]{408,429,500,502,503,504}){
   Harness harness=new Harness();for(int attempt=0;attempt<3;attempt++)harness.add(status,"",status==429?"0":null);
   assertEquals(status,harness.run("GET").status);assertEquals(3,harness.opened.size());assertEquals(status==429?Arrays.asList(0L,0L):Arrays.asList(500L,1000L),harness.time.waits);
   for(Connection connection:harness.opened){assertTrue(connection.disconnected);assertFalse(connection.getInstanceFollowRedirects());assertEquals(headers(),connection.getRequestProperties().entrySet().stream().collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,entry->entry.getValue().get(0))));assertNull(connection.getRequestProperty("Origin"));}
  }
 }
 @Test public void successStopsImmediatelyAndPreservesTextAndEtag()throws Exception {
  Harness harness=new Harness();harness.add(503,"",null);harness.add(200,"world",null);
  VoyageHttpPolicy.Response response=harness.run("GET");assertEquals("world",response.text);assertEquals("\"revision\"",response.etag);assertEquals(2,harness.opened.size());
 }
 @Test public void ioFailuresAndSocketTimeoutsRetryOnlyGets()throws Exception {
  for(String method:new String[]{"GET","POST","PUT","PATCH","DELETE"}){
   Harness harness=new Harness();for(int attempt=0;attempt<3;attempt++)harness.add(0,"",null).failure=attempt==0?new SocketTimeoutException("slow"):new IOException("offline");
   IOException failure=assertThrows(IOException.class,()->harness.run(method));assertEquals("GET".equals(method)?3:1,harness.opened.size());
   if(!"GET".equals(method))assertTrue(failure.getMessage().contains("Reconcile"));
  }
 }
 @Test public void mutationsIncludingValidateNeverRetryHttpFailures()throws Exception {
  for(String method:new String[]{"POST","PUT","DELETE"})for(int status:new int[]{408,429,500,502,503,504}){
   Harness harness=new Harness();harness.add(status,"studio_unavailable","0");assertEquals(status,harness.run(method).status);assertEquals(1,harness.opened.size());assertTrue(harness.time.waits.isEmpty());
  }
 }
 @Test public void protectedCodesNeverRetryEvenOnTransientGetStatuses()throws Exception {
  for(String code:new String[]{"request_status_unknown","request_in_progress","studio_version_mismatch"})for(int status:new int[]{408,429,500,502,503,504}){
   Harness harness=new Harness();harness.add(status,code,"0");assertEquals(code,harness.run("GET").code);assertEquals(1,harness.opened.size());assertTrue(harness.time.waits.isEmpty());
  }
 }
 @Test public void authConflictAndRedirectStatusesNeverRetry()throws Exception {
  for(int status:new int[]{301,302,307,308,400,401,403,404,409,412,422,428,501}){Harness harness=new Harness();harness.add(status,"",null);harness.run("GET");assertEquals(1,harness.opened.size());}
 }
 @Test public void retryAfterIsStrictAndOverflowIsNeverShortened(){
  long now=1792843200000L;
  assertEquals(500,VoyageHttpPolicy.retryDelay(null,now,1));assertEquals(1000,VoyageHttpPolicy.retryDelay(null,now,2));
  assertEquals(0,VoyageHttpPolicy.retryDelay("0",now,1));assertEquals(5000,VoyageHttpPolicy.retryDelay(" 5 ",now,1));assertEquals(6000,VoyageHttpPolicy.retryDelay("6",now,1));
  assertEquals(Long.MAX_VALUE,VoyageHttpPolicy.retryDelay("9999999999999999999999999",now,1));
  for(String header:new String[]{"","-1","1.5","later","5, 10","Sat, 24 Oct 2026 12:00:05 UTC","Sat, 24 Oct 2026 12:00:05 GMT junk","Sat, 99 Oct 2026 12:00:05 GMT","Sat, 24 Oct 2026 12:0:05 GMT"})assertEquals(header,-1,VoyageHttpPolicy.retryDelay(header,now,1));
  assertEquals(5000,VoyageHttpPolicy.retryDelay("Sat, 24 Oct 2026 12:00:05 GMT",now,1));assertEquals(0,VoyageHttpPolicy.retryDelay("Sat, 24 Oct 2026 11:59:00 GMT",now,1));
  assertEquals(-1,VoyageHttpPolicy.retryDelay("Sun, 24 Oct 2026 12:00:05 GMT",now,1));assertEquals(-1,VoyageHttpPolicy.retryDelay("Tue, 31 Feb 2026 12:00:05 GMT",now,1));
 }
 @Test public void rateLimitWithoutCooldownNeverGuessesARetry()throws Exception {
  Harness harness=new Harness();harness.add(429,"daily_limit",null);assertEquals(429,harness.run("GET").status);assertEquals(1,harness.opened.size());assertTrue(harness.time.waits.isEmpty());
  assertTrue(VoyageHttpPolicy.errorMessage(429,"daily_limit","","",null).contains("did not supply a cooldown; automatic retry stopped"));
 }
 @Test public void invalidOrLongCooldownStopsInsteadOfFallingBack()throws Exception {
  for(String delay:new String[]{"6","999999999999999999999","","bogus","Sat, 24 Oct 2026 12:00:06 GMT"}){Harness harness=new Harness();harness.add(429,"",delay);assertEquals(delay,harness.run("GET").retryAfter);assertEquals(1,harness.opened.size());assertTrue(harness.time.waits.isEmpty());}
 }
 @Test public void deltaAndDateCooldownAreRespectedExactly()throws Exception {
  for(String delay:new String[]{"5","Sat, 24 Oct 2026 12:00:05 GMT"}){Harness harness=new Harness();harness.add(503,"studio_unavailable",delay);harness.add(200,"",null);harness.run("GET");assertEquals(Arrays.asList(5000L),harness.time.waits);}
 }
 @Test public void sharedBudgetShrinksReadTimeoutAndStopsBeforeOversleep()throws Exception {
  Harness harness=new Harness();harness.add(503,"",null).elapsedOnResponse=30000;Connection second=harness.add(503,"","5");second.elapsedOnResponse=10000;
  harness.run("GET");assertEquals(2,harness.opened.size());assertEquals(Arrays.asList(500L),harness.time.waits);assertEquals(4500,second.getReadTimeout());
 }
 @Test public void exhaustedBudgetDoesNotRetry()throws Exception {
  Harness harness=new Harness();harness.add(503,"",null).elapsedOnResponse=45000;
  assertThrows(SocketTimeoutException.class,()->harness.run("GET"));assertEquals(1,harness.opened.size());assertTrue(harness.time.waits.isEmpty());
 }
 @Test public void writeBytesAndHeadersArePreservedWithoutRetry()throws Exception {
  Harness harness=new Harness();Connection connection=harness.add(503,"studio_unavailable","0");byte[] body="{\"world\":\"世界\"}".getBytes(StandardCharsets.UTF_8);
  harness.policy.execute("POST","https://example.invalid/creator/v1/validate",headers(),body,text->text);
  assertArrayEquals(body,connection.output.toByteArray());assertEquals("original-key",connection.getRequestProperty("Idempotency-Key"));assertEquals("POST",connection.getRequestMethod());assertEquals(1,harness.opened.size());
 }
 @Test public void alreadyInterruptedDoesNotOpenAConnection()throws Exception {
  Harness harness=new Harness();Thread.currentThread().interrupt();try{assertThrows(InterruptedException.class,()->harness.run("GET"));assertTrue(Thread.currentThread().isInterrupted());assertTrue(harness.opened.isEmpty());}finally{Thread.interrupted();}
 }
 @Test public void interruptedBackoffRestoresCancellation()throws Exception {
  Harness harness=new Harness();harness.add(503,"",null);harness.policy=new VoyageHttpPolicy(harness.time,delay->{throw new InterruptedException("cancel");},url->{Connection next=harness.pending.remove(0);harness.opened.add(next);return next;},45000);
  try{assertThrows(InterruptedException.class,()->harness.run("GET"));assertTrue(Thread.currentThread().isInterrupted());assertEquals(1,harness.opened.size());}finally{Thread.interrupted();}
 }
 @Test public void interruptedIoIsNotRetried()throws Exception {
  Harness harness=new Harness();harness.add(0,"",null).failure=new InterruptedIOException("cancel");
  try{assertThrows(InterruptedIOException.class,()->harness.run("GET"));assertTrue(Thread.currentThread().isInterrupted());assertEquals(1,harness.opened.size());}finally{Thread.interrupted();}
 }
 @Test public void errorBodyReadFailureCannotBypassUnknownSafetyCode()throws Exception {
  Harness harness=new Harness();Connection connection=new Connection(){public InputStream getErrorStream(){return new InputStream(){public int read()throws IOException{throw new IOException("lost error body");}};}};harness.pending.add(connection);
  assertThrows(IOException.class,()->harness.run("GET"));assertEquals(1,harness.opened.size());assertTrue(harness.time.waits.isEmpty());
 }
 @Test public void deadlineAndCancellationDisconnectBlockedReads()throws Exception {
  for(boolean cancel:new boolean[]{false,true}){
   CountDownLatch reading=new CountDownLatch(1),released=new CountDownLatch(1);AtomicReference<Throwable> result=new AtomicReference<>();
   Connection connection=new Connection(){public InputStream getInputStream(){return new InputStream(){public int read()throws IOException{reading.countDown();try{if(!released.await(2,TimeUnit.SECONDS))throw new IOException("guard did not disconnect");}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new InterruptedIOException();}throw new IOException("disconnected");}};}public void disconnect(){super.disconnect();released.countDown();}};connection.status=200;
   VoyageHttpPolicy.Clock clock=new VoyageHttpPolicy.Clock(){public long elapsedMillis(){return System.nanoTime()/1000000;}public long wallMillis(){return System.currentTimeMillis();}};
   VoyageHttpPolicy policy=new VoyageHttpPolicy(clock,Thread::sleep,url->connection,cancel?45000:100);
   Thread worker=new Thread(()->{try{policy.execute("GET","https://example.invalid",headers(),null,text->"");}catch(Throwable failure){result.set(failure);}});worker.start();assertTrue(reading.await(1,TimeUnit.SECONDS));if(cancel)worker.interrupt();worker.join(2500);
   assertFalse(worker.isAlive());assertTrue(connection.disconnected);assertTrue(String.valueOf(result.get()),cancel?result.get() instanceof InterruptedException:result.get() instanceof SocketTimeoutException);
  }
 }
 @Test public void cleanPutRejectionClassificationExcludesUncertainCodes(){
  for(int status:new int[]{400,401,403,404,405,412,413,415,422,428,429}){assertTrue(VoyageHttpPolicy.cleanRejection(status,""));assertFalse(VoyageHttpPolicy.cleanRejection(status,"request_status_unknown"));assertFalse(VoyageHttpPolicy.cleanRejection(status,"request_in_progress"));}
  assertTrue(VoyageHttpPolicy.cleanRejection(503,"studio_unavailable"));assertTrue(VoyageHttpPolicy.cleanRejection(409,"studio_version_mismatch"));assertFalse(VoyageHttpPolicy.cleanRejection(500,""));assertFalse(VoyageHttpPolicy.cleanRejection(409,""));
 }
 @Test public void bridgeMessagesPreservePrefixSanitizedIdAndCooldown(){
  String message=VoyageHttpPolicy.errorMessage(400,"invalid_revision","Bad revision","req\r\n<script>_1","10");
  assertTrue(message.startsWith("Voyage HTTP 400 (invalid_revision):"));assertTrue(message.contains("Request ID: reqscript_1."));assertTrue(message.contains("Retry-After: 10."));assertFalse(message.contains("\n"));
  assertTrue(VoyageHttpPolicy.errorMessage(429,"rate_limit","Wait","","nonsense").contains("Voyage supplied an invalid cooldown; check again later."));
 }
 @Test public void cooldownProseMatchesRendererContractExactly(){
  long now=1792843200000L;
  for(String delay:new String[]{"60","Sat, 24 Oct 2026 12:01:00 GMT"})assertTrue(VoyageHttpPolicy.errorMessage(429,"rate_limit","Wait","id",delay,now).contains(" Retry no earlier than 2026-10-24T12:01:00.000Z."));
  for(String delay:new String[]{"","bad","9999999999999999999999999999"}){String message=VoyageHttpPolicy.errorMessage(429,"rate_limit","Wait","id",delay,now);assertTrue(message.contains("Voyage supplied an invalid cooldown; check again later."));assertFalse(message.contains("Retry no earlier than"));}
  assertTrue(VoyageHttpPolicy.errorMessage(400,"invalid_\r\nrevision<>:","bad","id",null).startsWith("Voyage HTTP 400 (invalid_revision):"));
 }
 @Test public void guidanceDistinguishesSafeRetryUnknownOutcomeAndVersionMismatch(){
  String unavailable=VoyageHttpPolicy.errorMessage(503,"studio_unavailable","","id","5");assertTrue(unavailable.contains("no state reconciliation"));assertTrue(unavailable.contains("same idempotency key"));
  String unknown=VoyageHttpPolicy.errorMessage(503,"request_status_unknown","","id","5");assertTrue(unknown.contains("Reconcile"));assertTrue(unknown.contains("do not create new"));assertFalse(unknown.contains("no state reconciliation"));
  String version=VoyageHttpPolicy.errorMessage(409,"studio_version_mismatch","","id",null);assertTrue(version.contains("selected environment"));assertTrue(version.contains("explicitly choose"));assertTrue(version.contains("Never modify version"));
  for(int status:new int[]{401,403})assertTrue(VoyageHttpPolicy.errorMessage(status,"","","",null).contains("API keys"));
  assertTrue(VoyageHttpPolicy.errorMessage(429,"daily_limit","","",null).contains("cooldown"));
 }
 @Test public void loopbackGetRetriesPreserveRealHeadersAndResponse()throws Exception {
  List<String> requests=new ArrayList<>();AtomicReference<Throwable> serverFailure=new AtomicReference<>();
  try(ServerSocket server=new ServerSocket(0,4,java.net.InetAddress.getLoopbackAddress())){
   server.setSoTimeout(3000);
   Thread worker=new Thread(()->{try{for(int attempt=0;attempt<3;attempt++)try(Socket socket=server.accept()){
    BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));StringBuilder request=new StringBuilder();String line;while((line=reader.readLine())!=null&&!line.isEmpty())request.append(line).append('\n');requests.add(request.toString());
    String text=attempt<2?"{\"error\":{\"code\":\"studio_unavailable\"},\"requestId\":\"local-test\"}":"{\"world\":{}}";
    String response="HTTP/1.1 "+(attempt<2?"503 Unavailable":"200 OK")+"\r\nRetry-After: 0\r\nETag: \"loopback-revision\"\r\nContent-Length: "+text.getBytes(StandardCharsets.UTF_8).length+"\r\nConnection: close\r\n\r\n"+text;
    socket.getOutputStream().write(response.getBytes(StandardCharsets.UTF_8));socket.getOutputStream().flush();
   }}catch(Throwable failure){serverFailure.set(failure);}});worker.start();
   VoyageHttpPolicy.Response response=new VoyageHttpPolicy().execute("GET","http://127.0.0.1:"+server.getLocalPort()+"/creator/v1/worlds",headers(),null,text->text.contains("studio_unavailable")?"studio_unavailable":"");worker.join(3500);
   assertFalse(worker.isAlive());assertNull(serverFailure.get());assertEquals(3,requests.size());assertEquals("{\"world\":{}}",response.text);assertEquals("\"loopback-revision\"",response.etag);
   for(String request:requests){assertTrue(request.startsWith("GET /creator/v1/worlds HTTP/1.1"));assertTrue(request.contains("Authorization: Bearer test-only"));assertTrue(request.contains("If-Match: \"revision\""));assertTrue(request.contains("Idempotency-Key: original-key"));assertFalse(request.contains("Origin:"));}
  }
 }
}

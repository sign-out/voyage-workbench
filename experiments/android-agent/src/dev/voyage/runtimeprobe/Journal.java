package dev.voyage.runtimeprobe;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class Journal extends SQLiteOpenHelper {
    static final String BASE = "{\"title\":\"Android runtime fixture\",\"counter\":9007199254740993,\"unknown\":{\"keep\":\"unchanged\"}}";
    Journal(Context c) { super(c, "runtime.db", null, 1); setWriteAheadLoggingEnabled(true); }
    public void onConfigure(SQLiteDatabase d) { d.execSQL("PRAGMA synchronous=FULL"); }
    public void onCreate(SQLiteDatabase d) {
        d.execSQL("CREATE TABLE task (id INTEGER PRIMARY KEY, state TEXT, base TEXT, active TEXT, candidate TEXT, heartbeat INTEGER, detail TEXT)");
        d.execSQL("INSERT INTO task VALUES (1, 'IDLE', ?, ?, NULL, 0, '')", new Object[]{BASE, BASE});
    }
    public void onUpgrade(SQLiteDatabase d, int oldVersion, int newVersion) { throw new IllegalStateException("Unsupported migration"); }
    synchronized void prepare() {
        getWritableDatabase().execSQL("UPDATE task SET state='PREPARED', base=active, candidate=NULL, heartbeat=0, detail='' WHERE id=1");
    }
    synchronized void state(String state, String detail) {
        getWritableDatabase().execSQL("UPDATE task SET state=?, detail=? WHERE id=1", new Object[]{state,detail});
    }
    synchronized void beat() { getWritableDatabase().execSQL("UPDATE task SET heartbeat=heartbeat+1 WHERE id=1"); }
    synchronized void editFixture() {
        getWritableDatabase().execSQL("UPDATE task SET active=? WHERE id=1",new Object[]{BASE.replace("Android runtime fixture","Manual edit after task started")});
    }
    synchronized void resetFixture() {
        getWritableDatabase().execSQL("UPDATE task SET active=?, base=?, candidate=NULL, state='IDLE', detail='', heartbeat=0 WHERE id=1",new Object[]{BASE,BASE});
    }
    synchronized void recover() {
        getWritableDatabase().execSQL("UPDATE task SET state='INTERRUPTED', detail='Recovered after agent process interruption; task was not automatically restarted' WHERE state IN ('PREPARED','RUNNING')");
    }
    synchronized String field(String key) {
        try (Cursor c=getReadableDatabase().rawQuery("SELECT " + key + " FROM task WHERE id=1",null)) { c.moveToFirst(); return c.getString(0); }
    }
    synchronized void candidate(String title) throws Exception {
        if (!"Android runtime verified".equals(title)) throw new IllegalArgumentException("Title is outside this Work Order");
        String next=field("base").replace(JSONObject.quote("Android runtime fixture"),JSONObject.quote(title));
        if (next.equals(field("base"))) throw new IllegalArgumentException("Unexpected base fixture");
        getWritableDatabase().execSQL("UPDATE task SET candidate=? WHERE id=1",new Object[]{next});
    }
    synchronized void accept() {
        SQLiteDatabase d=getWritableDatabase(); d.beginTransaction();
        try {
            if (!"PROPOSAL_READY".equals(field("state")) || !field("active").equals(field("base")) || field("candidate")==null)
                throw new IllegalStateException("No current proposal or active world changed");
            d.execSQL("UPDATE task SET active=candidate, state='ACCEPTED' WHERE id=1"); d.setTransactionSuccessful();
        } finally { d.endTransaction(); }
    }
    synchronized JSONObject report() throws Exception {
        JSONObject j=new JSONObject();
        for(String key:new String[]{"state","heartbeat","detail"}) j.put(key,field(key));
        j.put("activeUnchanged",field("active").equals(field("base")));
        j.put("largeIntegerPreserved",field("active").contains("9007199254740993"));
        j.put("candidatePresent",field("candidate")!=null);
        j.put("activeHash",hash(field("active")));
        return j;
    }
    static String hash(String value) throws Exception {
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder b=new StringBuilder(); for(byte n:digest) b.append(String.format("%02x",n&255)); return b.toString();
    }
}

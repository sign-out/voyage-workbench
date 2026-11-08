package dev.voyage.workbench;

final class SyncPolicy {
 static String recovered(String state){return "sending".equals(state)?"unknown":"validating".equals(state)?"rejected":state;}
 static boolean canDiscard(String state){return "prepared".equals(state)||"validating".equals(state)||"rejected".equals(state);}
 static boolean canReadBack(String state){return "sending".equals(state)||"acknowledged".equals(state)||"unknown".equals(state);}
 static boolean revision(String value){return value!=null&&value.matches("\"[\\x21\\x23-\\x7e]+\"")&&!value.contains("\\")&&!value.contains(",")&&!"\"*\"".equals(value);}
}

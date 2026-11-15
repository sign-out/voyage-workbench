package dev.voyage.workbench;

final class SyncJson {
 static int whitespace(String source,int index){while(index<source.length()&&Character.isWhitespace(source.charAt(index)))index++;return index;}
 static int end(String source,int start)throws Exception{
  int depth=0;boolean quoted=false,escaped=false;
  for(int index=start;index<source.length();index++){
   char token=source.charAt(index);
   if(quoted){if(escaped)escaped=false;else if(token=='\\')escaped=true;else if(token=='"'){quoted=false;if(depth==0)return index+1;}continue;}
   if(token=='"')quoted=true;
   else if(token=='{'||token=='[')depth++;
   else if(token=='}'||token==']'){if(depth==0)return index;if(--depth==0)return index+1;}
   else if(depth==0&&(token==','||Character.isWhitespace(token)))return index;
  }
  if(quoted||depth!=0)throw new Exception("Incomplete JSON value");return source.length();
 }
 static String field(String source,String name)throws Exception{
  int index=whitespace(source,0);if(index>=source.length()||source.charAt(index++)!='{')throw new Exception("Expected a JSON object");
  while((index=whitespace(source,index))<source.length()&&source.charAt(index)!='}'){
   if(source.charAt(index)!='"')throw new Exception("Expected a JSON field name");int keyEnd=end(source,index);String key=source.substring(index+1,keyEnd-1);
   index=whitespace(source,keyEnd);if(index>=source.length()||source.charAt(index++)!=':')throw new Exception("Expected a JSON colon");index=whitespace(source,index);int valueEnd=end(source,index);
   if(key.equals(name))return source.substring(index,valueEnd);
   index=whitespace(source,valueEnd);if(index<source.length()&&source.charAt(index)==',')index++;else break;
  }
  throw new Exception("Missing JSON field: "+name);
 }
 static String world(String response)throws Exception{return field(field(response,"data"),"world");}
}

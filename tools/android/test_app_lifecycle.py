#!/usr/bin/env python3
import subprocess,shlex,tempfile,sqlite3,time,json,re,xml.etree.ElementTree as ET
from pathlib import Path
adb=str(Path.home()/'.local/share/voyage-android/sdk/platform-tools/adb');base=[adb,'-s','emulator-5556'];pkg='dev.voyage.workbench'
def run(*a,**kw):return subprocess.run(base+list(a),check=True,**kw)
def private(*a,**kw):return run('shell',shlex.join(['run-as',pkg,*a]),**kw)
def snapshot(project):
 with tempfile.TemporaryDirectory() as tmp:
  for name in ['workbench.db','workbench.db-wal']:
   result=subprocess.run(base+['exec-out','run-as',pkg,'cat','databases/'+name],capture_output=True)
   if result.returncode==0:Path(tmp,name).write_bytes(result.stdout)
  db=sqlite3.connect(str(Path(tmp,'workbench.db')))
  try:return json.loads(db.execute('select body from projects where id=?',(project,)).fetchone()[0])
  finally:db.close()
private('mkdir','-p','files/provider');private('sh','-c','umask 077; cat > files/provider/auth.json',input=(Path.home()/'.codex/auth.json').read_bytes())
private('rm','-f','files/lifecycle-project.txt')
proc=None
try:
 proc=subprocess.Popen(base+['shell','am','instrument','-w','-e','class','dev.voyage.workbench.WorkbenchTest#prepareLifecycleTask','-e','lifecycle','true',pkg+'.test/androidx.test.runner.AndroidJUnitRunner'],stdout=open("/tmp/voyage-lifecycle-instrument.log","w"),stderr=subprocess.STDOUT)
 project='';end=time.monotonic()+40
 while time.monotonic()<end:
  r=subprocess.run(base+['exec-out','run-as',pkg,'cat','files/lifecycle-project.txt'],capture_output=True)
  if r.returncode==0 and re.fullmatch(r'[0-9a-f-]{36}',r.stdout.decode().strip()):project=r.stdout.decode().strip();break
  time.sleep(.5)
 assert project,'Lifecycle task did not start'
 proc.wait(timeout=30)
 run('shell','am','start','-n',pkg+'/.MainActivity',stdout=subprocess.DEVNULL)
 time.sleep(3)
 def tap(text):
  for attempt in range(8):
   run('shell','uiautomator','dump','/sdcard/voyage-ui.xml',stdout=subprocess.DEVNULL)
   raw=run('exec-out','cat','/sdcard/voyage-ui.xml',capture_output=True).stdout
   tree=ET.fromstring(raw)
   for n in tree.iter('node'):
    if text in n.attrib.get('text','') or text==n.attrib.get('content-desc'):
     nums=list(map(int,re.findall(r'\d+',n.attrib['bounds'])))
     if len(nums)==4 and nums[2]>nums[0] and nums[3]>nums[1]:
      run('shell','input','tap',str((nums[0]+nums[2])//2),str((nums[1]+nums[3])//2));time.sleep(1);return
   run('shell','input','swipe','500','1600','500','500','400');time.sleep(.5)
  raise AssertionError('Could not find '+text)
 tap('Lifecycle app test');tap('Planning');tap('Approve & run')
 time.sleep(1)
 pid=run('shell','pidof',pkg,capture_output=True,text=True).stdout.strip();servicepid=run('shell','pidof',pkg+':agent',capture_output=True,text=True).stdout.strip();assert pid and servicepid
 private('kill','-9',pid)
 p=None;end=time.monotonic()+180
 while time.monotonic()<end:
  time.sleep(1)
  try:p=snapshot(project)
  except Exception:continue
  if p['tasks'][0]['state'] not in ['PREPARED','RUNNING']:break
 assert p['tasks'][0]['state']=='PROPOSAL_READY',p['tasks'][0]
 assert p['activeSource']=='{"title":"old","exact":9007199254740993}'
 assert p['candidates'][0]['source']=='{"title":"Lifecycle verified","exact":9007199254740993}'
 run('shell','am','force-stop',pkg)
 run('shell','am','start','-n',pkg+'/.MainActivity',stdout=subprocess.DEVNULL)
 time.sleep(3);restored=snapshot(project)
 assert restored['candidates'][0]['source']==p['candidates'][0]['source'];assert restored['activeSource']==p['activeSource']
 result={'uiProcessKilled':True,'serviceContinued':True,'candidateSurvivedForceStop':True,'activeWorldUnchanged':True,'largeNumberPreserved':True}
 Path('docs/evidence/app/android-lifecycle.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 private('rm','-f','files/provider/auth.json','files/lifecycle-project.txt')
 if proc and proc.poll() is None:proc.terminate()

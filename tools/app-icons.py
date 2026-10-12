from PIL import Image,ImageDraw
from pathlib import Path
import math
root=Path(__file__).resolve().parents[1]
def icon(size):
 im=Image.new('RGBA',(size,size),'#142c32');d=ImageDraw.Draw(im);u=size/512
 def coords(values):return tuple(round(v*u) for v in values)
 d.ellipse(coords((92,92,420,420)),outline='#91b5a0',width=max(1,int(13*u)))
 d.polygon(coords((315,136,295,294,198,376,218,218)),fill='#d5e8cf')
 d.polygon(coords((315,136,256,257,218,218)),fill='#80ab93')
 d.ellipse(coords((240,241,272,273)),fill='#142c32')
 return im
out=root/'assets';out.mkdir(exist_ok=True);icon(512).save(out/'icon.png');icon(256).save(out/'icon.ico',sizes=[(16,16),(32,32),(48,48),(256,256)])
res=root/'android/app/src/main/res'
for folder in res.glob('mipmap-*'):
 for path in folder.glob('*.png'):
  with Image.open(path) as old:size=old.width
  icon(size).save(path)
vector='''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512"><path android:fillColor="#142c32" android:pathData="M0,0H512V512H0Z"/><path android:strokeColor="#91b5a0" android:strokeWidth="13" android:fillColor="#00000000" android:pathData="M256,92A164,164 0,1 1,255.9 92"/><path android:fillColor="#d5e8cf" android:pathData="M315,136L295,294L198,376L218,218Z"/><path android:fillColor="#80ab93" android:pathData="M315,136L256,257L218,218Z"/></vector>'''
(res/'drawable-v24/ic_launcher_foreground.xml').write_text(vector)
for path in res.glob('drawable*/splash.png'):
 with Image.open(path) as old:size=old.size
 image=Image.new('RGB',size,'#142126');mark=icon(min(220,min(size)//3));image.paste(mark,((size[0]-mark.width)//2,(size[1]-mark.height)//2));image.save(path)

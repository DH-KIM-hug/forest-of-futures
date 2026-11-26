# 집 화면 그림을 웹용으로 만든다(U-33·U-34). 생성 아님: 원본을 줄이고(webp), 쳇바퀴를 오려 내고, 쳇바퀴 자리를 옆 바닥으로 덮은 조각을 만든다.
# 사용법: python3 mkart.py <repo> [preview_dir]
import sys
from PIL import Image, ImageFilter, ImageDraw, ImageChops
import numpy as np
repo=sys.argv[1]; prev=sys.argv[2] if len(sys.argv)>2 else None
OUT=repo+'/src/ui/proto/img/'
im=Image.open(repo+'/docs/art/v5/golden/home_stump.png').convert('RGB')
W,H=im.size
im.save(OUT+'home_stump.webp','WEBP',quality=82,method=6)
ox,oy=360,835
c=im.crop((ox,oy,570,1070)); a=np.asarray(c).astype(int)
lum=(a[...,0]*299+a[...,1]*587+a[...,2]*114)//1000
B=Image.fromarray(((lum<110)*255).astype('uint8')).filter(ImageFilter.MaxFilter(3))
F=B.copy(); w,h=F.size
for p in [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]:
    if F.getpixel(p)==0: ImageDraw.floodfill(F,p,128)
mask=Image.fromarray(((np.asarray(F)!=128)*255).astype('uint8'))
core=mask.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(11))
m=Image.fromarray((np.minimum(np.asarray(mask),np.asarray(core))).astype('uint8'))
G=m.copy(); ImageDraw.floodfill(G,(80,110),200)
solid=Image.fromarray(((np.asarray(G)==200)*255).astype('uint8'))
m=solid.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
bb=m.point(lambda v:255 if v>20 else 0).getbbox()
print('wheel bbox image',(bb[0]+ox,bb[1]+oy,bb[2]+ox,bb[3]+oy))
spr=c.convert('RGBA'); spr.putalpha(m); spr=spr.crop(bb)
spr.save(OUT+'wheel.webp','WEBP',quality=92,method=6)
# 쳇바퀴가 없는 바닥 조각: 널 이음매 방향으로 옆 바닥을 옮겨 덮는다
def soft(mk): return mk.filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(4))
full=Image.new('L',(W,H),0); full.paste(solid,(ox,oy))
sh=Image.new('L',(W,H),0)
ImageDraw.Draw(sh).polygon([(470,1050),(545,1000),(600,1010),(590,1050),(520,1075),(470,1068)],fill=255)
dx,dy=160,-84
out=Image.composite(ImageChops.offset(im,-dx,-dy),im,soft(full))
out=Image.composite(ImageChops.offset(im,dx,dy),out,soft(sh))
pb=(350,825,620,1095)
out.crop(pb).save(OUT+'floor_patch.webp','WEBP',quality=86,method=6)
print('patch box',pb)
if prev: out.crop((280,760,700,1160)).resize((840,800),Image.LANCZOS).save(prev)
h=Image.open(repo+'/docs/art/v5/golden/hero_phone.png'); hb=h.split()[-1].point(lambda v:255 if v>8 else 0).getbbox()
hc=h.crop(hb); HH=220; hc=hc.resize((round(hc.width*HH/hc.height),HH),Image.LANCZOS)
hc.save(OUT+'hero_phone.webp','WEBP',quality=90,method=6); print('hero',hc.size)

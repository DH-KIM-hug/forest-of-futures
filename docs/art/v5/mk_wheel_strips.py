import sys, math
from PIL import Image, ImageDraw
S=sys.argv[1]
drum=Image.open(f'{S}/obl/drum_open.png').crop((290,180,1016,1008))
cx,cy,rx,ry=415,385,248,262
OH=600; k=OH/drum.height; OW=round(drum.width*k)
drum.resize((OW,OH),Image.LANCZOS).save('src/ui/proto/img/v5/wheel_open_drum.webp',quality=88)
def strip(name,fr,seq,th):
    sc=th/fr[0].height; foot=cy+ry-40; cells=[]
    for i,si in enumerate(seq):
        f=fr[si]; w,h=int(f.width*sc),int(f.height*sc); r=f.resize((w,h),Image.LANCZOS)
        bob=-int(round(abs(math.sin(i*math.pi*2/len(seq)*(len(seq)/4)))*10))
        c=Image.new('RGBA',drum.size,(0,0,0,0)); d=ImageDraw.Draw(c)
        px=int(cx-w*0.5)+10; py=int(foot-h)+bob
        for kk,(yy,ll) in enumerate([(0.30,70),(0.52,110),(0.74,60)]):
            off=(i*23+kk*31)%40; y=py+int(h*yy); x=px+20-off
            d.line([(x-ll,y),(x,y)],fill=(80,52,30,255),width=10)
            d.line([(x-ll+3,y),(x-3,y)],fill=(255,251,238,255),width=5)
        c.alpha_composite(r,(px,py)); cells.append(c.resize((OW,OH),Image.LANCZOS))
    st=Image.new('RGBA',(OW*len(cells),OH),(0,0,0,0))
    for i,c in enumerate(cells): st.alpha_composite(c,(i*OW,0))
    st.save(f'src/ui/proto/img/v5/{name}.webp',quality=85); print(name,st.size,len(cells))
hero=[Image.open('docs/art/v5/raw/run_side_%s.png'%c).convert('RGBA') for c in 'abcd']; hero=[f.crop(f.getbbox()) for f in hero]
strip('hero_run_strip',hero,[0,1,2,1,0,1,2,3,3,1,2,1],300)
ham=[Image.open(f'{S}/obl/ham_run_%s.png'%c) for c in 'abc']
strip('hamster_run_strip',ham,[0,1,2,1],330)
s=300/drum.height; print('OW',OW,'HOOP',round(cx*s,1),round(cy*s,1),round(rx*s,1),round(ry*s,1),'ratio',drum.width/drum.height)

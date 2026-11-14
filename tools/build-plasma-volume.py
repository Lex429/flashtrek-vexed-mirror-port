"""Bake a top-down plasma funnel for the native nebula material (no colour art).

32 periodic frames, 96 square samples each, 8x4 atlas, raw RGBA8:
optical column depth, volume lighting, internal heat, entrainment coverage.
The expensive 3-D integration runs here, never in the game's frame loop.
"""
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SIZE=96;FRAMES=32;COLS=8;ROWS=4
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
rng=np.random.default_rng(170193)
grid=rng.random((32,32,32),dtype=np.float32)
def noise(x,y,z):
 ix=np.floor(x).astype(np.int32);iy=np.floor(y).astype(np.int32);iz=np.floor(z).astype(np.int32)
 fx=smooth(0,1,x-ix);fy=smooth(0,1,y-iy);fz=smooth(0,1,z-iz)
 result=np.zeros_like(x)
 for dz in (0,1):
  for dy in (0,1):
   for dx in (0,1):result+=grid[(iz+dz)%32,(iy+dy)%32,(ix+dx)%32]*(fx if dx else 1-fx)*(fy if dy else 1-fy)*(fz if dz else 1-fz)
 return result

q=np.linspace(-1.35,1.35,SIZE,dtype=np.float32)
sx,sy=np.meshgrid(q,q)
atlas=np.zeros((SIZE*ROWS,SIZE*COLS,4),dtype=np.uint8)
for frame in range(FRAMES):
 phase=frame/FRAMES*np.pi*2
 optical=np.zeros_like(sx);light=np.zeros_like(sx);hot=np.zeros_like(sx)
 for depth in np.linspace(0,1.6,48,dtype=np.float32):
  # Look down the axis: a broad ragged mouth recedes into an off-centre throat.
  # Layered cone walls, entrained fog and curled noise produce the opening;
  # there are no repeated spiral arms or an imposed circular eye boundary.
  x=sx-.10*depth*np.sin(depth*2+.3*np.sin(phase))
  y=sy-.08*depth*np.cos(depth*3+.3*np.cos(phase))
  radius=np.sqrt(x*x+y*y)
  twist=2.8*np.log(radius+.16)+depth*1.1
  angle=-phase+twist+.35*np.sin(phase+depth*3+radius*4)
  c=np.cos(angle);s=np.sin(angle);rx=x*c-y*s;ry=x*s+y*c
  n1=noise(rx*4.2+13,ry*4.2+11,np.full_like(x,depth*3+7))
  fine_angle=-phase*2+twist*1.2
  fc=np.cos(fine_angle);fs=np.sin(fine_angle);fx=x*fc-y*fs;fy=x*fs+y*fc
  n2=noise(fx*10.5+5,fy*10.5+19,np.full_like(x,depth*7+17))
  n3=noise(rx*23+3,ry*23+2,np.full_like(x,depth*15+23))
  structure=.52*n1+.32*n2+.16*n3
  width=1.06*np.exp(-depth*1.3)+.08
  wall=np.exp(-((radius-width+(n1-.5)*.18)/(.12+depth*.035))**2)
  entrained=(1-smooth(.75,1.25,radius))*.07
  density=(wall+entrained)*smooth(.16,.77,structure)*(.50+.75*n2)
  density*=1-smooth(1.13,1.31,np.sqrt(sx*sx+sy*sy))
  amount=density*(1.6/48)*4.0
  # Front layers occlude deeper folds. Interior light fades into the funnel.
  normal=(-x*.65-y*.76)/np.maximum(.05,radius)
  illumination=(.30+.65*np.clip(.5+.5*normal,0,1))*(1-depth*.20)
  visible=np.exp(-optical*.65)
  light+=amount*illumination*visible
  hot+=amount*(.38+.62*n2)*(1-depth*.35)*visible
  optical+=amount
 depth=1-np.exp(-optical*1.45)
 weighted=(1-np.exp(-optical*.65))/.65
 illumination=np.divide(light,weighted,out=np.zeros_like(light),where=weighted>1e-5)
 temperature=np.divide(hot,weighted,out=np.zeros_like(hot),where=weighted>1e-5)
 # The shadowed central fog still belongs to the original nebula; only the
 # compressed wall folds glow strongly. No solid black hole is painted here.
 values=np.stack((depth,illumination,depth*(.30+.70*temperature),smooth(0,.32,depth)),axis=-1)
 tile=np.round(np.clip(values,0,1)*255).astype(np.uint8)
 row,col=divmod(frame,COLS);atlas[row*SIZE:(row+1)*SIZE,col*SIZE:(col+1)*SIZE]=tile
out=ROOT/'html-games/broken-mirror-port/assets/plasma-volume-v1.bin'
out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(atlas.tobytes())
print(f'{out}: {atlas.shape[1]}x{atlas.shape[0]}, {out.stat().st_size} bytes')

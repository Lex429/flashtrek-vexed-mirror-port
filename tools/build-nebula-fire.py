"""Bake periodic, top-down plasma heating; no colour art or runtime noise.

16 96-square frames, 4x4 atlas, raw RGBA8 channels:
optical depth, temperature, illumination, entrainment coverage.
"""
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SIZE=96;FRAMES=16
rng=np.random.default_rng(710347)
grid=rng.random((32,32,32),dtype=np.float32)
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def noise(x,y,z):
 ix=np.floor(x).astype(np.int32);iy=np.floor(y).astype(np.int32);iz=np.floor(z).astype(np.int32)
 fx=smooth(0,1,x-ix);fy=smooth(0,1,y-iy);fz=smooth(0,1,z-iz);out=np.zeros_like(x)
 for dz in (0,1):
  for dy in (0,1):
   for dx in (0,1):out+=grid[(iz+dz)%32,(iy+dy)%32,(ix+dx)%32]*(fx if dx else 1-fx)*(fy if dy else 1-fy)*(fz if dz else 1-fz)
 return out
q=np.linspace(-1,1,SIZE,dtype=np.float32);x,y=np.meshgrid(q,q)
atlas=np.zeros((SIZE*4,SIZE*4,4),dtype=np.uint8)
for frame in range(FRAMES):
 phase=frame/FRAMES*np.pi*2
 optical=np.zeros_like(x);light=np.zeros_like(x);heat=np.zeros_like(x)
 for z in np.linspace(-1.05,1.05,18,dtype=np.float32):
  # A loose volume of overlapping billows, viewed from above. Heat is spread
  # across gas cells rather than concentrated along a flame-shaped ridge.
  u=x+.12*np.sin(y*4+z+phase)+.045*np.sin(y*9-z*2-phase)
  v=y+.11*np.sin(x*3-z+phase*2)+.05*np.sin(x*8+z*2-phase)
  n1=noise(u*3.4+.4*np.cos(phase)+9,v*3.4+.4*np.sin(phase)+7,np.full_like(x,z*2.4+13))
  n2=noise(u*8+.5*np.cos(phase*2)+17,v*8+.5*np.sin(phase*2)+19,np.full_like(x,z*5+3))
  n3=noise(u*19+np.cos(phase)+2,v*19+np.sin(phase)+4,np.full_like(x,z*12+23))
  structure=.53*n1+.31*n2+.16*n3
  radius=np.sqrt((x+.07*z)**2+(y-.06*z)**2)
  edge=(1-smooth(.43,.99,radius+(n1-.5)*.20))*(1-smooth(.45,1.08,np.abs(z)))
  density=edge*smooth(.27,.72,structure)*(.65+.55*n2)
  amount=density*(2.1/18)*1.6;visible=np.exp(-optical*.8)
  light+=amount*np.clip(.32+.55*n2-.15*y+.08*z,.08,.95)*visible
  heat+=amount*(.18+.68*n1+.17*n3)*visible;optical+=amount
 weight=(1-np.exp(-optical*.8))/.8
 average_light=np.divide(light,weight,out=np.full_like(light,.5),where=weight>1e-5)
 temperature=np.divide(heat,weight,out=np.zeros_like(heat),where=weight>1e-5)
 fold=noise(x*4+.4*np.cos(phase)+3,y*4+.4*np.sin(phase)+6,np.full_like(x,17))
 illumination=np.clip(average_light+.72*(fold-.5)-.10*optical,.08,.92)
 optical=1-np.exp(-optical*1.4)
 boundary=1-smooth(.82,.99,np.sqrt(x*x+y*y))
 coverage=smooth(.012,.38,optical)*boundary
 cells=smooth(.22,.78,fold)
 temperature=np.clip(temperature*(.15+cells),0,1)
 optical=np.clip(optical*(.45+.8*cells),0,1)
 tile=np.round(np.clip(np.stack((optical,temperature,illumination,coverage),axis=-1),0,1)*255).astype(np.uint8)
 row,col=divmod(frame,4);atlas[row*SIZE:(row+1)*SIZE,col*SIZE:(col+1)*SIZE]=tile
out=ROOT/'html-games/broken-mirror-port/assets/nebula-fire-v1.bin'
out.write_bytes(atlas.tobytes());print(f'{out}: 384x384, {out.stat().st_size} bytes')

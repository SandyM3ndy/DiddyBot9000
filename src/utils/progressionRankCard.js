// Dependency-free, deterministic Discord-ready PNG rank cards (no external asset services).
import { deflateSync } from 'node:zlib';

const WIDTH=1000,HEIGHT=520;
const THEMES={
 default:{base:[9,15,31],mix:[27,42,75],outline:[65,111,185],inner:[13,24,48],accent:[67,209,231]},
 sunset:{base:[31,17,38],mix:[97,54,48],outline:[234,140,105],inner:[60,32,58],accent:[255,187,130]},
 galaxy:{base:[16,10,43],mix:[32,44,135],outline:[141,107,255],inner:[25,19,69],accent:[167,157,253]},
 emerald:{base:[8,27,31],mix:[20,83,53],outline:[65,166,118],inner:[15,56,55],accent:[126,238,168]},
};
const BORDERS={gold:[245,196,80],diamond:[171,230,255]};
const GLYPHS={
'A':[14,17,17,31,17,17,17],'B':[30,17,17,30,17,17,30],
'C':[14,17,16,16,16,17,14],'D':[30,17,17,17,17,17,30],
'E':[31,16,16,30,16,16,31],'F':[31,16,16,30,16,16,16],
'G':[14,17,16,23,17,17,14],'H':[17,17,17,31,17,17,17],
'I':[31,4,4,4,4,4,31],'J':[7,2,2,2,18,18,12],
'K':[17,18,20,24,20,18,17],'L':[16,16,16,16,16,16,31],
'M':[17,27,21,21,17,17,17],'N':[17,25,21,19,17,17,17],
'O':[14,17,17,17,17,17,14],'P':[30,17,17,30,16,16,16],
'Q':[14,17,17,17,21,18,13],'R':[30,17,17,30,20,18,17],
'S':[15,16,16,14,1,1,30],'T':[31,4,4,4,4,4,4],
'U':[17,17,17,17,17,17,14],'V':[17,17,17,17,17,10,4],
'W':[17,17,17,21,21,21,10],'X':[17,17,10,4,10,17,17],
'Y':[17,17,10,4,4,4,4],'Z':[31,1,2,4,8,16,31],
'0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],
'2':[14,17,1,2,4,8,31],'3':[30,1,1,14,1,1,30],
'4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],
'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],
'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
' ':[0,0,0,0,0,0,0],'.':[0,0,0,0,0,12,12],
'-':[0,0,0,31,0,0,0],':':[0,12,12,0,12,12,0],
'/':[1,1,2,4,8,16,16],'#':[10,10,31,10,31,10,10],
'!':[4,4,4,4,4,0,4],'+':[0,4,4,31,4,4,0],
'?':[14,17,1,2,4,0,4],'_':[0,0,0,0,0,0,31],
};
const clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
function crc32(buf){
 let crc=-1;
 for(const b of buf){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1) ^ (crc&1?0xedb88320:0);}
 return (crc^(-1))>>>0;
}
function chunk(type,data){
 const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);
 size.writeUInt32BE(data.length,0);crc.writeUInt32BE(crc32(Buffer.concat([name,data])),0);
 return Buffer.concat([size,name,data,crc]);
}
export function renderProgressionRankPng({name='COMMUNITY',rank=null,level=1,xp=0,progress=0,founder=null,appearance={},fastPreview=false}={}){
 const theme=THEMES[appearance?.background]||THEMES.default;
 const frame=BORDERS[appearance?.border]||theme.outline;
 const data=Buffer.alloc(WIDTH*HEIGHT*4);
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  const i=(y*WIDTH+x)*4,g=(x/WIDTH)*0.26+(y/HEIGHT)*0.18;
  const stripe=(x+y)%48<2?5:0;
  data[i]=clamp(theme.base[0]+g*theme.mix[0]+stripe);
  data[i+1]=clamp(theme.base[1]+g*theme.mix[1]+stripe);
  data[i+2]=clamp(theme.base[2]+g*theme.mix[2]+stripe*2);data[i+3]=255;
 }
 const box=(x,y,w,h,color)=>{
  x=Math.max(0,Math.floor(x));y=Math.max(0,Math.floor(y));
  for(let yy=y;yy<Math.min(HEIGHT,y+h);yy++)for(let xx=x;xx<Math.min(WIDTH,x+w);xx++){
   const i=(yy*WIDTH+xx)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
  }
 };
 const write=(t,x,y,s,color=[245,248,255],max=32)=>{
  let cx=x;
  for(const char of String(t).normalize('NFKD').replace(/[^\x20-\x7E]/g,'').toUpperCase().slice(0,max)){
   for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++){
    if(((GLYPHS[char]||GLYPHS['?'])[ry]>>(4-rx))&1)box(cx+rx*s,y+ry*s,s,s,color);
   }
   cx+=s*6;
  }
 };
 box(27,27,946,466,frame);box(31,31,938,458,theme.inner);
 box(45,46,10,58,theme.accent);write('BEACON',75,50,6,[229,244,255]);
 write('WORLD RANKINGS',75,107,2,[111,177,215]);
 box(75,163,850,2,[49,87,137]);
 // Identity mark: an intentionally graphic server monogram, no remote avatar dependencies.
 box(75,202,132,132,[25,75,114]);box(83,210,116,116,[18,46,78]);
 write(String(name).trim().charAt(0)||'?',119,232,10,[97,224,236],1);
 write('SERVER',243,205,3,[108,160,194]);
 write(name,243,244,4,[242,248,255],23);
 write('LEVEL',76,375,3,[126,171,208]);
 write(String(level),76,412,7,[109,223,236],8);
 write('GLOBAL RANK',312,375,3,[126,171,208]);
 write(rank===null?'UNRANKED':'#'+rank,312,412,6,[251,213,129],12);
 write('TOTAL XP',646,375,3,[126,171,208]);
 write(Math.max(0,Math.floor(xp)).toLocaleString('en-US'),646,413,4,[247,247,250],14);
 box(75,351,850,10,[37,55,82]);
 box(75,351,Math.floor(850*Math.max(0,Math.min(100,progress))/100),10,theme.accent);
 if(appearance?.tag==='royal'||appearance?.tag==='pioneer'){
  const tag=appearance.tag==='royal'?'ROYAL SANDS':'SAND PIONEER';
  box(694,125,222,34,appearance.tag==='royal'?[103,77,31]:[42,97,104]);
  write(tag,702,134,2,[255,236,182],18);
 }
 if(founder) {
  box(740,72,177,50,[57,83,120]);
  write('FOUNDER #'+founder.number,754,87,3,[255,224,146],11);
 }
 const scan=Buffer.alloc(HEIGHT*(1+WIDTH*4));
 for(let y=0;y<HEIGHT;y++){
  const target=y*(1+WIDTH*4);scan[target]=0;
  data.copy(scan,target+1,y*WIDTH*4,(y+1)*WIDTH*4);
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(WIDTH,0);ihdr.writeUInt32BE(HEIGHT,4);
 ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
  chunk('IDAT',deflateSync(scan,{level:fastPreview?1:7})),chunk('IEND',Buffer.alloc(0))]);
}

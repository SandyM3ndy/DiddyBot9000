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
// All effects are deterministic and local; no external images or new purchases.
// The seven original cosmetic IDs keep exactly the same meaning and ownership.
export function renderProgressionRankPng({name='COMMUNITY',rank=null,level=1,xp=0,progress=0,founder=null,appearance={},fastPreview=false}={}){
 const bg=appearance?.background;
 const border=appearance?.border;
 const tag=appearance?.tag;
 const theme=THEMES[bg]||THEMES.default;
 const data=Buffer.alloc(WIDTH*HEIGHT*4);
 const rgb=(a,b,t)=>a.map((v,i)=>clamp(v+(b[i]-v)*t));
 const stops={
  default:[[7,13,32],[19,43,81],[17,26,55]],
  sunset:[[22,16,47],[101,42,87],[253,129,95],[57,32,77]],
  galaxy:[[6,8,33],[23,18,74],[43,23,94],[9,17,55]],
  emerald:[[5,25,28],[13,68,64],[38,105,85],[10,37,43]],
 };
 const gradient=stops[bg]||stops.default;
 const rowColors=Array.from({length:HEIGHT},(_,y)=>{
  const t=y/(HEIGHT-1);
  const k=Math.min(gradient.length-2,Math.floor(t*(gradient.length-1)));
  return rgb(gradient[k],gradient[k+1],t*(gradient.length-1)-k);
 });
 // Whole-card backgrounds: luminous sunset, star-filled nebula, or misty
 // emerald forest. Contrasting glass panels keep guild names legible.
 for(let y=0;y<HEIGHT;y++){
  const row=rowColors[y];
  for(let x=0;x<WIDTH;x++){
   const i=(y*WIDTH+x)*4, fx=x/WIDTH, fy=y/HEIGHT;
   let r=row[0]+fx*9,g=row[1]+fx*6,b=row[2]+fx*12;
   if(bg==='sunset'){
    const dx=(x-765)/250,dy=(y-325)/210;
    const halo=Math.max(0,1-dx*dx-dy*dy);
    r+=halo*81;g+=halo*55;b+=halo*24;
    const sun=Math.max(0,1-((x-768)**2+(y-327)**2)/(107**2));
    r+=sun*61;g+=sun*93;b+=sun*53;
    if(y>352){
     const glint=Math.max(0,1-Math.abs(x-767)/(110+(y-352)*1.2));
     r+=glint*33;g+=glint*16;
    }
   }else if(bg==='galaxy'){
    const cloud=(cx,cy,rx,ry)=>Math.max(0,1-((x-cx)/rx)**2-((y-cy)/ry)**2);
    const a=cloud(715,195,450,230),c=cloud(410,335,400,175),d=cloud(910,335,280,240);
    r+=a*57+c*22+d*25;g+=a*17+c*51+d*11;b+=a*107+c*83+d*56;
    const h=Math.imul(x+31,73856093)^Math.imul(y+17,19349663);
    if((h>>>0)%1307===0){r=204;g=220;b=255;}
    else if((h>>>0)%3479===0){r=155;g=148;b=239;}
   }else if(bg==='emerald'){
    const mist=Math.max(0,1-Math.abs(y-305)/200);
    r+=mist*8;g+=mist*43;b+=mist*24;
    const backHill=350+18*Math.sin(x*.014)+17*Math.sin(x*.005+1);
    const frontHill=421+16*Math.sin(x*.019+2)+13*Math.sin(x*.008);
    if(y>backHill){r=r*.43;g=g*.68;b=b*.65;}
    if(y>frontHill){r=r*.4;g=g*.54;b=b*.52;}
    const h=Math.imul(x+17,2654435761)^Math.imul(y+79,2246822519);
    if((h>>>0)%5999===0 && y<400){r+=88;g+=158;b+=104;}
   }else{
    const d=Math.max(0,1-((x-760)/420)**2-((y-240)/320)**2);
    r+=d*9;g+=d*13;b+=d*31;
   }
   const grain=(Math.imul(x+7,374761393)^Math.imul(y+41,668265263))>>>0;
   const n=(grain%9)-4;
   data[i]=clamp(r+n*.45);
   data[i+1]=clamp(g+n*.45);
   data[i+2]=clamp(b+n*.50);
   data[i+3]=255;
  }
 }
 const box=(x,y,w,h,color,opacity=1)=>{
  x=Math.floor(x);y=Math.floor(y);
  for(let yy=Math.max(0,y);yy<Math.min(HEIGHT,y+h);yy++)
   for(let xx=Math.max(0,x);xx<Math.min(WIDTH,x+w);xx++){
    const i=(yy*WIDTH+xx)*4;
    if(opacity===1){data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];}
    else{data[i]=clamp(data[i]*(1-opacity)+color[0]*opacity);
     data[i+1]=clamp(data[i+1]*(1-opacity)+color[1]*opacity);
     data[i+2]=clamp(data[i+2]*(1-opacity)+color[2]*opacity);}
   }
 };
 const rounded=(x,y,w,h,r,color,opacity=1)=>{
  const xl=Math.max(0,Math.floor(x)),yl=Math.max(0,Math.floor(y));
  const xr=Math.min(WIDTH,Math.floor(x+w)),yr=Math.min(HEIGHT,Math.floor(y+h));
  for(let yy=yl;yy<yr;yy++)for(let xx=xl;xx<xr;xx++){
   const dx=xx<x+r?x+r-xx:xx>x+w-r?xx-(x+w-r):0;
   const dy=yy<y+r?y+r-yy:yy>y+h-r?yy-(y+h-r):0;
   if(dx*dx+dy*dy>r*r)continue;
   const i=(yy*WIDTH+xx)*4;
   data[i]=clamp(data[i]*(1-opacity)+color[0]*opacity);
   data[i+1]=clamp(data[i+1]*(1-opacity)+color[1]*opacity);
   data[i+2]=clamp(data[i+2]*(1-opacity)+color[2]*opacity);
  }
 };
 const line=(x1,y1,x2,y2,color,width=2)=>{
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(x2-x1),Math.abs(y2-y1))));
  for(let s=0;s<=steps;s++){
   const x=x1+(x2-x1)*s/steps,y=y1+(y2-y1)*s/steps;
   box(Math.floor(x-width/2),Math.floor(y-width/2),width,width,color);
  }
 };
 const sparkle=(x,y,scale,color)=>{
  box(x-scale*4,y,scale*9,scale,color,.88);
  box(x,y-scale*4,scale,scale*9,color,.88);
  box(x-scale*2,y-scale*2,scale,scale,color,.75);
  box(x+scale*2,y+scale*2,scale,scale,color,.75);
 };
 const write=(t,x,y,s,color=[245,248,255],max=32)=>{
  let cx=x;
  for(const char of String(t).normalize('NFKD').replace(/[^\x20-\x7E]/g,'').toUpperCase().slice(0,max)){
   for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++)
    if(((GLYPHS[char]||GLYPHS['?'])[ry]>>(4-rx))&1)
     box(cx+rx*s,y+ry*s,s,s,color);
   cx+=s*6;
  }
 };
 const gold=border==='gold',diamond=border==='diamond';
 const accent=gold?[255,202,103]:diamond?[161,224,255]:theme.accent;
 // Metallic and crystal surrounds use layered bevels, not a flat 4px line.
 rounded(13,14,974,493,32,[0,0,0],.48);
 rounded(19,17,962,486,29,gold?[99,56,18]:diamond?[27,68,113]:[37,82,133]);
 rounded(23,21,954,478,27,gold?[255,219,130]:diamond?[220,249,255]:[71,145,201]);
 rounded(27,25,946,470,25,gold?[162,100,31]:diamond?[67,155,210]:[18,50,100]);
 rounded(34,32,932,456,22,[8,13,32],.74);
 if(gold||diamond){
  const bright=gold?[255,246,197]:[245,253,255],deep=gold?[194,124,43]:[57,139,205];
  line(53,39,947,39,bright,3);
  line(40,51,40,465,bright,3);
  line(53,481,947,481,deep,3);
  line(960,55,960,463,deep,3);
  for(const [xx,yy] of [[45,45],[953,45],[45,475],[953,475]]){
   rounded(xx-10,yy-10,20,20,6,deep,.96);
   rounded(xx-5,yy-5,10,10,3,bright,.96);
  }
  sparkle(278,30,2,bright);
  sparkle(902,485,2,bright);
  if(diamond){sparkle(908,29,3,[255,255,255]);sparkle(36,315,2,[232,250,255]);}
  else{sparkle(92,26,2,[255,255,215]);sparkle(969,205,2,[255,234,179]);}
 }
 // Inner frosted pane, readable regardless of the scenery behind it.
 rounded(59,180,875,169,19,[5,12,28],.53);
 rounded(59,366,875,94,15,[6,15,33],.42);
 box(72,164,854,2,accent,.62);
 box(76,351,846,8,[6,16,34],.9);
 rounded(45,49,10,58,4,accent);
 write('BEACON',75,50,6,[242,248,255]);
 write('WORLD RANKINGS',75,107,2,accent);
 // Decorative high contrast UI marks and a polished monogram.
 rounded(75,199,132,135,21,accent,.75);
 rounded(79,203,124,127,19,[8,22,43],.91);
 rounded(87,211,108,111,15,[18,56,82],.83);
 sparkle(96,219,2,[243,252,255]);
 write(String(name).trim().charAt(0)||'?',119,234,10,[221,251,255],1);
 write('SERVER',243,205,3,accent);
 write(name,244,245,4,[249,252,255],23);
 // XP bar is layered and glossy, including a subtle light-rail.
 rounded(75,351,850,10,5,[21,40,64],1);
 const progressWidth=Math.floor(850*Math.max(0,Math.min(100,progress))/100);
 if(progressWidth){
  rounded(75,351,Math.max(10,progressWidth),10,5,accent,.95);
  box(82,352,Math.max(0,progressWidth-14),2,[240,253,255],.55);
 }
 write('LEVEL',76,375,3,[152,188,225]);
 write(String(level),76,412,7,[132,234,253],8);
 write('GLOBAL RANK',312,375,3,[152,188,225]);
 write(rank===null?'UNRANKED':'#'+rank,312,412,6,[255,219,148],12);
 write('TOTAL XP',646,375,3,[152,188,225]);
 write(Math.max(0,Math.floor(xp)).toLocaleString('en-US'),646,413,4,[246,250,255],14);
 // Name tags are collector-quality emblems, not flat text rectangles.
 if(tag==='royal'||tag==='pioneer'){
  const isRoyal=tag==='royal',badgeX=648,badgeY=120;
  const metal=isRoyal?[89,49,133]:[37,84,96],edge=isRoyal?[255,215,121]:[135,227,228];
  rounded(badgeX-3,badgeY-3,279,53,14,[0,0,0],.68);
  rounded(badgeX,badgeY,273,47,13,edge,.99);
  rounded(badgeX+3,badgeY+3,267,41,11,metal,.98);
  rounded(badgeX+7,badgeY+5,259,12,7,isRoyal?[166,100,205]:[98,180,183],.67);
  box(badgeX+8,badgeY+36,256,2,edge,.60);
  sparkle(badgeX+21,badgeY+22,2,isRoyal?[255,232,171]:[217,253,246]);
  sparkle(badgeX+250,badgeY+22,2,isRoyal?[255,232,171]:[217,253,246]);
  write(isRoyal?'ROYAL SANDS':'SAND PIONEER',badgeX+43,badgeY+16,2,
   isRoyal?[255,239,189]:[227,255,254],18);
 }
 if(founder){
  rounded(741,73,174,49,13,[40,63,101],.96);
  rounded(745,77,166,41,10,[78,107,144],.68);
  write('FOUNDER #'+founder.number,752,88,3,[255,224,146],11);
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

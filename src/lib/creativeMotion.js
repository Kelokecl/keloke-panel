export const MOTION_FORMATS={vertical:[1080,1920],square:[1080,1080],landscape:[1920,1080]};
export function wrapLines(ctx,text,maxWidth,maxLines=3){const lines=[];let line='';for(const word of String(text||'').trim().split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);if(lines.length>maxLines){const result=lines.slice(0,maxLines);result[maxLines-1]=result[maxLines-1].replace(/[.,;:!?]+$/,'')+'…';return result;}return lines;}
export function drawCreative(canvas,image,options={},time=0){
 const {width:w,height:h}=canvas,ctx=canvas.getContext('2d');const portrait=h>w,scale=w/1080,pad=72*scale;
 ctx.clearRect(0,0,w,h);const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#102f26');bg.addColorStop(1,'#1f503a');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#c0ed7820';ctx.lineWidth=60*scale;ctx.beginPath();ctx.arc(w*.95,h*.1,w*.32+Math.sin(time*.5)*8*scale,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#c4ec7b';ctx.font=`700 ${34*scale}px system-ui`;ctx.fillText('keloke.',pad,pad+25*scale);
 const phase=Math.min(2,Math.floor(time/5)),alpha=Math.min(1,(time%5)*3+.15),movement=18*(1-alpha)*scale;
 const headline=[options.headline||options.productName,options.benefit||options.productName,options.cta||'Conoce el producto'][phase];
 const photoW=portrait?w-pad*2:w*.46,photoH=portrait?h*.43:h*.60,photoX=portrait?pad:w*.5,photoY=portrait?h*.32:h*.22;
 ctx.save();ctx.translate(photoX+photoW/2,photoY+photoH/2);const zoom=1+Math.sin(time*.35)*.025;ctx.scale(zoom,zoom);ctx.fillStyle='#f6f8f1';ctx.beginPath();ctx.roundRect(-photoW/2,-photoH/2,photoW,photoH,28*scale);ctx.fill();
 if(image){const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;const fit=Math.min((photoW-70*scale)/iw,(photoH-70*scale)/ih);ctx.drawImage(image,-iw*fit/2,-ih*fit/2,iw*fit,ih*fit);}ctx.restore();
 ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#fff';const fontSize=(portrait?72:65)*scale;ctx.font=`700 ${fontSize}px system-ui`;const textWidth=portrait?w-pad*2:w*.40;const y=portrait?h*.15:h*.34;
 wrapLines(ctx,headline,textWidth,portrait?3:4).forEach((line,i)=>ctx.fillText(line,pad,y+i*fontSize*1.15+movement));ctx.restore();
 const detailY=portrait?h*.81:h*.71;ctx.fillStyle='#d4e6d5';ctx.font=`500 ${31*scale}px system-ui`;wrapLines(ctx,options.productName,portrait?w-pad*2:w*.40,2).forEach((line,i)=>ctx.fillText(line,pad,detailY+i*40*scale));
 if(options.price!=null&&options.price!==''){ctx.fillStyle='#c4ec7b';ctx.font=`700 ${46*scale}px system-ui`;ctx.fillText(new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(options.price)),pad,detailY+100*scale);}
 ctx.fillStyle='#c4ec7b';const buttonY=h-pad-87*scale;ctx.beginPath();ctx.roundRect(pad,buttonY,Math.min(w-pad*2,portrait?790*scale:800*scale),66*scale,12*scale);ctx.fill();ctx.fillStyle='#193529';ctx.font=`650 ${26*scale}px system-ui`;const buttonText=String(options.cta||'Conoce el producto').slice(0,45);ctx.fillText(buttonText,pad+24*scale,buttonY+43*scale);
}
export async function encodeMotion(canvas,image,options,onProgress=()=>{},signal){
 if(typeof VideoEncoder==='undefined')throw new Error('Este navegador no permite exportar MP4. Usa Chrome o Edge actualizado.');
 const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,Quality}=await import('mediabunny');
 const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});const source=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:4_000_000}),keyFrameInterval:2});output.addVideoTrack(source,{frameRate:24});
 try{await output.start();for(let frame=0;frame<360;frame++){if(signal?.aborted)throw new Error('Exportación cancelada.');drawCreative(canvas,image,options,frame/24);await source.add(frame/24,1/24);if(frame%12===0){onProgress(Math.round(frame/360*100));await new Promise(resolve=>setTimeout(resolve,0));}}source.close();await output.finalize();onProgress(100);return new Blob([output.target.buffer],{type:'video/mp4'});}catch(error){await output.cancel().catch(()=>{});throw error;}
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}

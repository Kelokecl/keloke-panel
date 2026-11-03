export function buildCreativeCaption(content={},platform='instagram'){
 const clean=value=>String(value||'').replace(/^(ATENCIÓN|INTERÉS|DESEO|ACCIÓN|PROBLEMA|AGITACIÓN|SOLUCIÓN):\s*/gim,'').trim();
 const main=clean(content.caption||content.body||content.title),cta=clean(content.cta);
 const pieces=[main];if(cta&&!main.toLocaleLowerCase('es').includes(cta.toLocaleLowerCase('es')))pieces.push(cta);
 const tags=[...new Set(String(content.hashtags||'').match(/#[\p{L}\p{N}_]+/gu)||[])].filter(tag=>!main.includes(tag)).slice(0,5);
 if(platform!=='whatsapp'&&tags.length)pieces.push(tags.join(' '));
 return pieces.filter(Boolean).join('\n\n').slice(0,platform==='whatsapp'?900:platform==='instagram'?2200:5000);
}

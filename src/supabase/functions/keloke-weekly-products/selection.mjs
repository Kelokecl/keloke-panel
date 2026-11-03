export function selectFive(candidates) {
 const seen=new Set();
 return candidates.filter(p=>{
  if(!p.external_id||!p.title||!(Number(p.sold_quantity)>0)||!(Number(p.price_clp)>0))return false;
  try{const u=new URL(p.product_url);if(u.protocol!=='https:'||!/(^|\.)mercadolibre\.cl$/.test(u.hostname))return false;}catch{return false;}
  if(seen.has(p.external_id))return false;seen.add(p.external_id);return true;
 }).sort((a,b)=>Number(b.sold_quantity)-Number(a.sold_quantity)||a.external_id.localeCompare(b.external_id)).slice(0,5);
}

import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {selectFive} from './selection.mjs';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
async function fetchBounded(url:string,options:RequestInit={}){return await fetch(url,{...options,signal:AbortSignal.timeout(10000)});}
Deno.serve(async req=>{
 if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
 const key=req.headers.get('x-weekly-key');if(!key)return json({ok:false,error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:week,error:claimError}=await db.rpc('keloke_claim_weekly_scan',{p_key:key});
 if(claimError)return json({ok:false,error:'Unauthorized'},401);
 if(!week)return json({ok:true,skipped:true,reason:'Weekly selection already attempted'});
 async function finish(status:string,items:unknown[],notice:string|null){
  const {error}=await db.from('keloke_weekly_products').update({status,items,notice,completed_at:new Date().toISOString()}).eq('week_start',week);
  if(error)throw new Error('Could not save weekly selection');
 }
 try{
  // OAuth callback stores its current credentials in meli_oauth_tokens.
  const {data:current}=await db.from('meli_oauth_tokens').select('id,access_token,refresh_token,expires_at').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  const {data:legacy}=current?.access_token?{data:null}:await db.from('api_tokens').select('access_token,refresh_token,expires_at').eq('provider','mercadolibre').maybeSingle();
  const token=current?.access_token?current:legacy;
  if(!token?.access_token)throw new Error('MELI_RECONNECT');
  let access=token.access_token;
  if(!token.expires_at||Date.parse(token.expires_at)<Date.now()+60000){
   let client=Deno.env.get('ML_CLIENT_ID')||Deno.env.get('MELI_CLIENT_ID');
   let secret=Deno.env.get('ML_CLIENT_SECRET')||Deno.env.get('MELI_CLIENT_SECRET');
   if(!client||!secret){const {data:config}=await db.from('meli_oauth_config').select('client_id,client_secret').limit(1).maybeSingle();client=client||config?.client_id;secret=secret||config?.client_secret;}
   if(!token.refresh_token||!client||!secret)throw new Error('MELI_RECONNECT');
   const res=await fetchBounded('https://api.mercadolibre.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client,client_secret:secret,refresh_token:token.refresh_token})});
   if(!res.ok)throw new Error('MELI_RECONNECT');
   const refreshed=await res.json();if(!refreshed.access_token)throw new Error('MELI_RECONNECT');
   access=refreshed.access_token;
   const patch={access_token:access,refresh_token:refreshed.refresh_token||token.refresh_token,expires_at:new Date(Date.now()+Number(refreshed.expires_in||21600)*1000).toISOString(),updated_at:new Date().toISOString()};
   const {error:saveError}=current?.access_token?await db.from('meli_oauth_tokens').update(patch).eq('id',current.id):await db.from('api_tokens').update(patch).eq('provider','mercadolibre');
   if(saveError)throw new Error('TOKEN_SAVE');
  }
  const categories=[['Hogar','MLC1574'],['Tecnología','MLC1648'],['Mascotas','MLC1071'],['Deportes','MLC1499'],['Belleza','MLC1430'],['Salud','MLC187772'],['Auto','MLC1743']];
  const candidates:any[]=[];let failures=0;
  // Seven bounded requests per week. No paid scraping or per-page scans.
  for(const [category,id] of categories){
   try{
    const res=await fetchBounded(`https://api.mercadolibre.com/sites/MLC/search?category=${id}&limit=10&sort=sold_quantity_desc`,{headers:{Authorization:`Bearer ${access}`}});
    if(!res.ok){failures++;continue;}
    const data=await res.json();
    for(const item of (data.results||[]).slice(0,10)){
     if(item.currency_id!=='CLP')continue;
     candidates.push({external_id:item.id,title:item.title,category,price_clp:item.price,sold_quantity:item.sold_quantity,product_url:item.permalink,image_url:item.thumbnail?.replace(/^http:/,'https:'),observed_at:new Date().toISOString(),source:'mercadolibre'});
    }
   }catch{failures++;}
  }
  const items=selectFive(candidates);
  const notice=items.length===5&&!failures?null:items.length?`Hay ${items.length} productos con evidencia disponible. ${failures?'Algunas categorías no respondieron.':''}`:'La fuente no entregó productos con ventas verificables. Revisa el acceso de Mercado Libre; no se reutilizaron datos antiguos.';
  await finish(items.length===5&&!failures?'completed':'partial',items,notice);
  return json({ok:true,count:items.length,status:items.length===5&&!failures?'completed':'partial'});
 }catch(error){
  const message=error instanceof Error&&error.message==='MELI_RECONNECT'?'Mercado Libre requiere renovar su autorización. La selección semanal no puede actualizarse hasta reconectar la fuente.':'No fue posible actualizar la selección semanal. Revisa la conexión de la fuente.';
  try{await finish('failed',[],message)}catch{return json({ok:false,error:'Could not save scan status'},500)}
  return json({ok:false,error:message},502);
 }
});

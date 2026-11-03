import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
const cors={'Access-Control-Allow-Origin':'https://keloke-panel.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});
 if(req.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 let allowed=false;
 const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(jwt){const {data}=await db.auth.getUser(jwt);if(data.user){const {data:p}=await db.from('users').select('role,is_active').eq('id',data.user.id).maybeSingle();allowed=p?.role==='admin'&&p.is_active;}}
 if(!allowed)return reply({ok:false,error:'Unauthorized'},401);
 const result:any={openai:{configured:!!Deno.env.get('OPENAI_API_KEY'),models:[],text_model:null,image_model:null},instagram:{status:'not_connected'},tiktok:{configured:!!Deno.env.get('TIKTOK_CLIENT_KEY')&&!!Deno.env.get('TIKTOK_CLIENT_SECRET')}};
 try{
  if(result.openai.configured){const r=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${Deno.env.get('OPENAI_API_KEY')}`},signal:AbortSignal.timeout(12000)});const j=await r.json();if(r.ok){const ids=(j.data||[]).map((m:any)=>m.id);result.openai.models=ids.filter((id:string)=>/^(gpt-6|gpt-5|gpt-image)/.test(id)).slice(0,90);result.openai.text_model=['gpt-6-astra','gpt-6.1-sol','gpt-5.5','gpt-5-mini'].find(id=>ids.includes(id))||null;result.openai.image_model=['gpt-image-2.5-flare','gpt-image-2','gpt-image-1.5'].find(id=>ids.includes(id))||null;result.openai.status='available';}else result.openai.status=r.status===401?'invalid_key':'provider_error';}
 }catch{result.openai.status='unreachable';}
 try{
  const {data:row}=await db.from('user_social_tokens').select('access_token').in('platform',['instagram','facebook']).eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(row?.access_token){const r=await fetch('https://graph.facebook.com/v24.0/me?fields=id',{headers:{Authorization:`Bearer ${row.access_token}`},signal:AbortSignal.timeout(12000)});const j=await r.json();result.instagram=r.ok?{status:'facebook_token_valid',message:'Acceso válido. Falta verificar la suscripción y probar un mensaje.'}:{status:j.error?.code===190?'requires_reauth':'permissions_error',provider_code:j.error?.code,message:j.error?.code===190?'Renueva Facebook e Instagram en Conexiones.':'Revisa los permisos de mensajería de Meta.'};}
 }catch{result.instagram={status:'unreachable',message:'No pudimos consultar Meta.'};}
 const {data:tiktok}=await db.from('user_social_tokens').select('is_active,token_expires_at,token_expire').eq('platform','tiktok').order('updated_at',{ascending:false}).limit(1).maybeSingle();result.tiktok.connected=!!tiktok?.is_active;result.tiktok.expired=!!(tiktok&&(tiktok.token_expires_at||tiktok.token_expire)&&Date.parse(tiktok.token_expires_at||tiktok.token_expire)<Date.now());
 const {error}=await db.from('keloke_runtime_checks').upsert({key:'capabilities',payload:result,checked_at:new Date().toISOString()});if(error)return reply({ok:false,error:'Could not save check'},500);
 return reply({ok:true,...result});
});

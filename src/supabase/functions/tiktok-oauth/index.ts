import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
const APP='https://keloke-panel.vercel.app';
const cors={'Access-Control-Allow-Origin':APP,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function done(success:boolean,error='',sandbox=false){const payload=JSON.stringify({type:'OAUTH_RESULT',platform:'tiktok',success,error,sandbox}).replace(/</g,'\\u003c');return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Conexión TikTok</title><body><p>${success?(sandbox?'Prueba de TikTok completada. No se guardó una conexión de producción.':'TikTok conectado. Puedes cerrar esta ventana.'):'No se completó la conexión. Regresa a Keloke para reintentar.'}</p><script>if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(APP)});setTimeout(()=>window.close(),600)}</script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});
 const url=new URL(req.url),db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const stateParam=url.searchParams.get('state');
 const start=url.pathname.endsWith('/start');
 const sandbox=start ? url.searchParams.get('mode')==='sandbox' : stateParam?.startsWith('keloke_tiktok_sandbox_')===true;
 const client=Deno.env.get(sandbox?'TIKTOK_SANDBOX_CLIENT_KEY':'TIKTOK_CLIENT_KEY');
 const secret=Deno.env.get(sandbox?'TIKTOK_SANDBOX_CLIENT_SECRET':'TIKTOK_CLIENT_SECRET');
 const redirect=sandbox ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/tiktok-oauth` : (Deno.env.get('TIKTOK_REDIRECT_URI')||`${APP}/oauth/callback`);
 if(start){
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return json({error:'Inicia sesión en Keloke.'},401);
  const {data}=await db.auth.getUser(jwt);if(!data.user)return json({error:'La sesión venció. Inicia sesión nuevamente.'},401);
  const {data:profile}=await db.from('users').select('role,is_active').eq('id',data.user.id).maybeSingle();if(!profile?.is_active||profile.role!=='admin')return json({error:'Se requiere una cuenta administradora.'},403);
  if(!client||!secret)return json({error:'Faltan las credenciales del entorno seleccionado de TikTok.'},503);
  const state=(sandbox?'keloke_tiktok_sandbox_':'keloke_tiktok_')+crypto.randomUUID()+crypto.randomUUID();
  const {error}=await db.from('keloke_oauth_states').insert({state_hash:await hash(state),user_id:data.user.id,platform:'tiktok',redirect_uri:redirect});if(error)return json({error:'No pudimos preparar una conexión segura.'},500);
  const scope=sandbox?'user.info.basic':(Deno.env.get('TIKTOK_SCOPES')||'user.info.basic,user.info.profile');
  const authUrl='https://www.tiktok.com/v2/auth/authorize/?'+new URLSearchParams({client_key:client,response_type:'code',scope,redirect_uri:redirect,state}).toString();return json({url:authUrl});
 }
 if(url.pathname.endsWith('/callback') || (url.pathname.endsWith('/tiktok-oauth') && stateParam)){
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||!state.startsWith('keloke_tiktok_'))return done(false,'La solicitud de conexión no es válida.');
  // Atomic DELETE RETURNING: a state cannot be exchanged twice.
  const {data:pending}=await db.from('keloke_oauth_states').delete().eq('state_hash',await hash(state)).eq('platform','tiktok').gt('expires_at',new Date().toISOString()).select('user_id,redirect_uri').maybeSingle();
  if(!pending)return done(false,'La solicitud venció o ya fue utilizada.');
  if(url.searchParams.get('error')||!code)return done(false,'TikTok no autorizó la conexión.');
  if(!client||!secret)return done(false,'Falta configurar la aplicación de TikTok.');
  try{
   const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:client,client_secret:secret,code,grant_type:'authorization_code',redirect_uri:pending.redirect_uri}),signal:AbortSignal.timeout(15000)});
   const token=await r.json();if(!r.ok||!token.access_token)return done(false,'TikTok rechazó el intercambio. Revisa la dirección de retorno registrada y los permisos de la app.');
   if(sandbox){
    const profile=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(10000)});
    const info=await profile.json();
    if(!profile.ok||!info.data?.user?.open_id)return done(false,'TikTok no devolvió el perfil de prueba.',true);
    return done(true,'',true);
   }
   let accountName='TikTok',username=null;try{const profile=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(10000)});const p=await profile.json();accountName=p.data?.user?.display_name||accountName;username=p.data?.user?.username||null;}catch{}
   const {error}=await db.from('user_social_tokens').upsert({user_id:pending.user_id,platform:'tiktok',access_token:token.access_token,refresh_token:token.refresh_token||null,token_expires_at:new Date(Date.now()+Number(token.expires_in||86400)*1000).toISOString(),account_user:token.open_id||null,account_name:accountName,account_username:username,is_active:true,updated_at:new Date().toISOString()},{onConflict:'user_id,platform'});
   return error?done(false,'No pudimos guardar la conexión en Keloke.'):done(true);
  }catch{return done(false,'No pudimos completar la conexión con TikTok.');}
 }
 return json({error:'Not found'},404);
});

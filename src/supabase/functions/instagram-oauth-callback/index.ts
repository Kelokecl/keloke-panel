import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
const APP='https://keloke-panel.vercel.app';
const finish=(ok:boolean,error='',account='')=>new Response(null,{status:302,headers:{Location:APP+'/oauth/callback?'+new URLSearchParams({platform:'instagram',success:String(ok),error,account_name:account,state:JSON.stringify({app_origin:APP})}).toString(),'Cache-Control':'no-store'}});
Deno.serve(async req=>{
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 try{
  const url=new URL(req.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state?.startsWith('keloke_instagram_'))return finish(false,'La solicitud no es válida. Inicia la conexión desde Keloke.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const {data:pending}=await db.from('keloke_oauth_states').delete().eq('state_hash',hash).eq('platform','instagram').gt('expires_at',new Date().toISOString()).select('user_id,redirect_uri').maybeSingle();if(!pending)return finish(false,'La solicitud venció o ya se utilizó.');if(!code||url.searchParams.get('error'))return finish(false,'Meta no autorizó la conexión.');
  const tokenResponse=await fetch('https://graph.facebook.com/v24.0/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:Deno.env.get('INSTAGRAM_APP_ID')!,client_secret:Deno.env.get('INSTAGRAM_APP_SECRET')!,redirect_uri:pending.redirect_uri,code}),signal:AbortSignal.timeout(15000)});const token=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)return finish(false,'Meta rechazó la conexión. Revisa el App ID, la dirección de retorno y sus permisos.');
  const headers={Authorization:`Bearer ${token.access_token}`};const pagesResponse=await fetch('https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100',{headers,signal:AbortSignal.timeout(15000)});const pages=await pagesResponse.json();
  const {data:existing}=await db.from('publish_connections').select('facebook_page_id').eq('platform','facebook').eq('is_active',true).maybeSingle();
  const page=(pages.data||[]).find((p:any)=>String(p.id)===String(existing?.facebook_page_id));
  const ig=page?.instagram_business_account;const name=ig?.username||page?.name||'Instagram';const expires=token.expires_in?new Date(Date.now()+Number(token.expires_in)*1000).toISOString():null;
  const {error}=await db.from('user_social_tokens').upsert({user_id:pending.user_id,platform:'instagram',access_token:token.access_token,refresh_token:null,token_expire:expires,token_expires_at:expires,account_name:name,account_username:ig?.username||null,account_user:ig?.id||null,is_active:true,updated_at:new Date().toISOString()},{onConflict:'user_id,platform'});if(error)return finish(false,'No pudimos guardar la conexión.');
  if(!page||!ig)return finish(false,'Acceso guardado. Meta no devolvió la página de Keloke vinculada a Instagram; revisa la selección de cuentas y los permisos.');
  const {error:mappingError}=await db.from('publish_connections').update({facebook_page_id:page.id,instagram_business_id:ig.id,is_active:true,updated_at:new Date().toISOString()}).eq('platform','instagram');if(mappingError)return finish(false,'Acceso guardado. No pudimos actualizar la cuenta profesional de Instagram.');
  const subscribed=await fetch(`https://graph.facebook.com/v24.0/${page.id}/subscribed_apps`,{method:'POST',headers:{Authorization:`Bearer ${page.access_token}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({subscribed_fields:'messages,messaging_postbacks'}),signal:AbortSignal.timeout(15000)});const sub=await subscribed.json();
  await db.from('keloke_runtime_checks').upsert({key:'instagram_subscription',payload:{ok:subscribed.ok&&sub.success===true,page_id:page.id,instagram_id:ig.id,message:subscribed.ok?'Suscripción registrada. Falta probar la recepción de un mensaje real.':'Meta no permitió registrar la suscripción de mensajes.'},checked_at:new Date().toISOString()});
  if(!subscribed.ok||!sub.success)return finish(false,'La cuenta se conectó, pero Meta no autorizó la suscripción de mensajes. Revisa los permisos de la app.');
  return finish(true,'',name);
 }catch{return finish(false,'No pudimos completar la conexión con Instagram.');}
});

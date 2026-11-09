import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
const APP='https://keloke-panel.vercel.app';const cors={'Access-Control-Allow-Origin':APP,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}}),jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return reply({error:'Inicia sesión.'},401);
 const {data}=await db.auth.getUser(jwt);if(!data.user)return reply({error:'La sesión venció.'},401);const {data:p}=await db.from('users').select('role,is_active').eq('id',data.user.id).maybeSingle();if(!p?.is_active||p.role!=='admin')return reply({error:'Acceso restringido.'},403);
 const id=Deno.env.get('INSTAGRAM_APP_ID');if(!id||!Deno.env.get('INSTAGRAM_APP_SECRET'))return reply({error:'Falta configurar la app de Instagram.'},503);
 const redirect=`${Deno.env.get('SUPABASE_URL')}/functions/v1/instagram-oauth-callback`,state='keloke_instagram_'+crypto.randomUUID()+crypto.randomUUID();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const {error}=await db.from('keloke_oauth_states').insert({state_hash:digest,user_id:data.user.id,platform:'instagram',redirect_uri:redirect});if(error)return reply({error:'No pudimos preparar la conexión.'},500);
 const auth=new URL('https://www.facebook.com/v24.0/dialog/oauth');auth.search=new URLSearchParams({client_id:id,redirect_uri:redirect,response_type:'code',state,scope:'public_profile,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_messages,instagram_manage_comments,instagram_content_publish'}).toString();return reply({url:auth.href});
});

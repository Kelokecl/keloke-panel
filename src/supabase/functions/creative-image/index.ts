import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.4';
const cors={'Access-Control-Allow-Origin':'https://keloke-panel.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});if(req.method!=='POST')return reply({ok:false,error:'Método no permitido'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!jwt)return reply({ok:false,error:'Inicia sesión.'},401);
 const {data:auth}=await db.auth.getUser(jwt);if(!auth.user)return reply({ok:false,error:'Sesión vencida.'},401);
 const {data:profile}=await db.from('users').select('role,is_active').eq('id',auth.user.id).maybeSingle();if(!profile?.is_active||profile.role!=='admin')return reply({ok:false,error:'Acceso restringido.'},403);
 try{
  const body=await req.json();const {data:product}=await db.from('products').select('id,name,image_url').eq('id',body.product_id).maybeSingle();
  if(body.action==='upload_ticket'){
   if(!product)return reply({ok:false,error:'Selecciona un producto válido.'},400);
   const bucket='keloke-creatives';const {data:b}=await db.storage.getBucket(bucket);if(!b){const {error}=await db.storage.createBucket(bucket,{public:true,fileSizeLimit:30*1024*1024,allowedMimeTypes:['image/png','video/mp4']});if(error)return reply({ok:false,error:'No pudimos preparar el almacenamiento de creatividades.'},500);}
   const path=`${auth.user.id}/${crypto.randomUUID()}.mp4`;const {data,error}=await db.storage.from(bucket).createSignedUploadUrl(path);if(error)return reply({ok:false,error:'No pudimos preparar la subida del MP4.'},500);
   const {data:publicData}=db.storage.from(bucket).getPublicUrl(path);return reply({ok:true,bucket,path,token:data.token,asset_url:publicData.publicUrl});
  }
  if(!product?.image_url)return reply({ok:false,error:'El producto necesita una fotografía de referencia.'},400);
  const {data:check}=await db.from('keloke_runtime_checks').select('payload').eq('key','capabilities').maybeSingle();const model=check?.payload?.openai?.image_model;
  if(!model||!/^gpt-image-[a-zA-Z0-9.-]+$/.test(model))return reply({ok:false,error:'No hay un modelo de imagen disponible. Comprueba el acceso de IA.'},503);
  const imageUrl=new URL(product.image_url);if(imageUrl.protocol!=='https:'||!['cdn.shopify.com','ggqsgkaeopvbsultjgvt.supabase.co'].includes(imageUrl.hostname))return reply({ok:false,error:'La fotografía debe venir del catálogo Shopify o del almacenamiento de Keloke.'},400);
  const reference=await fetch(imageUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!reference.ok)return reply({ok:false,error:'No pudimos leer la fotografía del producto.'},502);
  const type=reference.headers.get('Content-Type')?.split(';')[0]||'';if(!['image/png','image/jpeg','image/webp'].includes(type))return reply({ok:false,error:'Usa una fotografía JPG, PNG o WebP.'},400);
  const reader=reference.body?.getReader();if(!reader)return reply({ok:false,error:'Fotografía vacía.'},400);const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10*1024*1024){await reader.cancel();return reply({ok:false,error:'La fotografía supera los 10 MB.'},400)}chunks.push(value)}
  const prompt=`Create a polished product advertising photograph for Keloke, Chile. Use the attached product as the exact reference: preserve shape, color, branding and function. Do not invent accessories or claims. Strong professional art direction, premium lighting, clear composition, generous space for later text overlay. No prices, fake review badges, discounts or promises. Creative direction: ${String(body.prompt||'Clean premium product presentation').slice(0,1500)}`;
  const form=new FormData();form.set('model',model);form.set('prompt',prompt);form.set('n','1');form.set('quality','medium');form.set('size',body.vertical?'1024x1536':'1024x1024');form.set('image[]',new Blob(chunks,{type}),'product-reference.'+(type==='image/jpeg'?'jpg':type.split('/')[1]));
  const r=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('OPENAI_API_KEY')}`},body:form,signal:AbortSignal.timeout(140000)});const data=await r.json();if(!r.ok)return reply({ok:false,error:data.error?.code==='insufficient_quota'?'El motor de imagen necesita saldo en OpenAI.':r.status===403?'El modelo de imagen requiere habilitar acceso o verificar la organización en OpenAI.':'El motor de imagen no pudo completar la pieza.',provider_status:r.status},502);
  const encoded=data.data?.[0]?.b64_json;if(!encoded)return reply({ok:false,error:'El motor no devolvió una imagen.'},502);
  const bytes=Uint8Array.from(atob(encoded),(c:string)=>c.charCodeAt(0));
  // Marketing creatives are public assets intended for social publishing; no message data is uploaded.
  const bucket='keloke-creatives';const {data:b}=await db.storage.getBucket(bucket);if(!b){const {error}=await db.storage.createBucket(bucket,{public:true,fileSizeLimit:30*1024*1024,allowedMimeTypes:['image/png','video/mp4']});if(error)return reply({ok:false,error:'No pudimos preparar el almacenamiento de creatividades.'},500)}
  const path=`${auth.user.id}/${crypto.randomUUID()}.png`;const {error}=await db.storage.from(bucket).upload(path,bytes,{contentType:'image/png',upsert:false});if(error)return reply({ok:false,error:'La imagen se generó, pero no pudimos guardarla.'},500);
  const {data:url}=db.storage.from(bucket).getPublicUrl(path);return reply({ok:true,asset_url:url.publicUrl,asset_type:'image',model});
 }catch{return reply({ok:false,error:'No pudimos completar la imagen. Revisa el acceso o inténtalo nuevamente.'},500)}
});

// ContentGenerator.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import CreativeStudioTools from './CreativeStudioTools';
import {buildCreativeCaption} from '../lib/creativeCopy';
import {
  FileText, Image as ImageIcon, Video, Sparkles,
  Download, Copy, Share2, Eye, Wand2, RefreshCw,
  TrendingUp, Target, Users, Zap
} from 'lucide-react';

/**
 * ContentGenerator.jsx (FULL - GOD MODE)
 *
 * Fixes:
 * - ✅ BUG CRÍTICO: se eliminó JSX fuera del return() (rompía el componente)
 * - ✅ MP4 priority: product.video_url (MP4) > Video URL manual (MP4)
 * - ✅ Preview no rompe: si preview es MP4 renderiza <video>, si no <img>
 * - ✅ YouTube bloquea si no hay MP4 (ya estaba, se deja intacto)
 * - ✅ Retry IG cuando el video aún se está procesando (ya estaba, se deja intacto)
 * - Anti-freeze: lock + abort + timeout + watchdog
 * - Caption FINAL consistente (lo que se publica = lo que se programa)
 * - Programación guarda generated_content_id (si existe) y caption final
 * - No asume columnas nuevas obligatorias en DB
 */

function isMp4Url(url) {
  if (!url) return false;
  const u = String(url).trim().toLowerCase();
  // simple + robust enough for direct mp4 links
  return u.includes('.mp4') || u.includes('video/mp4') || u.includes('format=mp4');
}

export default function ContentGenerator() {
  const [loading, setLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  // ✅ Manual MP4 input (solo si el producto no tiene video_url MP4)
  const [videoUrl, setVideoUrl] = useState('');

  const [products, setProducts] = useState([]);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Form
  const [campaignType, setCampaignType] = useState('organic');
  const [platform, setPlatform] = useState('instagram');
  const [contentType, setContentType] = useState('post');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [strategy, setStrategy] = useState('aida');
  const [abVariant, setAbVariant] = useState('A');
  const [ageRange, setAgeRange] = useState('25-45');
  const [interests, setInterests] = useState('');
  const [tone, setTone] = useState('profesional');
  const [brief,setBrief]=useState('');
  const [destinationUrl,setDestinationUrl]=useState('');
  const [engine,setEngine]=useState(null);
  const [checkingEngine,setCheckingEngine]=useState(false);
  const [drafts,setDrafts]=useState([]);
  async function loadDrafts(){const {data}=await supabase.from('generated_content').select('id,title,product_id,platform,content_type,created_at').eq('status','draft').order('created_at',{ascending:false}).limit(8);setDrafts(data||[])}
  async function restoreDraft(id){const {data,error}=await supabase.from('generated_content').select('*').eq('id',id).eq('status','draft').single();if(error){setStatusMsg({type:'err',text:'No pudimos abrir el borrador.'});return}setSelectedProduct(data.product_id||'');setPlatform(data.platform||'instagram');setContentType(data.content_type||'post');setBrief(data.creative_payload?.brief||'');setDestinationUrl(data.creative_payload?.destination_url||'');setGeneratedContent({...data,...data.creative_payload});}
  const activeProduct=products.find(p=>String(p.id)===String(selectedProduct))||null;
  useEffect(()=>{supabase.from('keloke_runtime_checks').select('payload').eq('key','capabilities').maybeSingle().then(({data})=>{setEngine(data?.payload||null);if(!data)checkEngine()});},[]);
  async function checkEngine(){setCheckingEngine(true);try{const {data,error}=await supabase.functions.invoke('keloke-capabilities',{body:{}});if(error||!data?.ok)throw new Error('No pudimos comprobar los accesos. Revisa tu sesión.');setEngine(data);setStatusMsg({type:'info',text:data.openai?.text_model?'Motor disponible: '+data.openai.text_model:'El motor de IA requiere revisar su acceso.'});}catch(e){setStatusMsg({type:'err',text:e.message})}finally{setCheckingEngine(false)}}
  async function setCreativeAsset(url,type){
    if(!generatedContent?.id)throw new Error('Genera y guarda el copy antes de añadir una pieza.');
    const patch={asset_url:url,asset_type:type,preview_url:url,...(type==='video'?{content_type:'reel'}:{})};
    const {error}=await supabase.from('generated_content').update(patch).eq('id',generatedContent.id).eq('status','draft');
    if(error)throw new Error('No pudimos guardar la pieza en el borrador.');
    setGeneratedContent(previous=>({...previous,...patch}));if(type==='video'){setContentType('reel');setVideoUrl(url)}
  }

  // retry / regen
  const [lastRequest, setLastRequest] = useState(null);

  // UI messages
  const [statusMsg, setStatusMsg] = useState(null); // {type:'ok'|'err'|'info', text:''}

  // anti-freeze infra
  const requestLockRef = useRef(false);
  const genAbortRef = useRef(null);
  const watchdogRef = useRef(null);

  useEffect(() => {
    loadProducts();
    loadDrafts();
    return () => {
      try {
        if (genAbortRef.current) genAbortRef.current.abort();
      } catch {}
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const platformMeta = useMemo(() => ([
    { id: 'instagram', name: 'Instagram', emoji: '📸' },
    { id: 'tiktok', name: 'TikTok', emoji: '🎵' },
    { id: 'facebook', name: 'Facebook', emoji: '👥' },
    { id: 'youtube', name: 'YouTube', emoji: '▶️' },
    { id: 'whatsapp', name: 'WhatsApp', emoji: '💬' }
  ]), []);

  const clearStatusSoon = (ms = 2500) => {
    window.setTimeout(() => setStatusMsg(null), ms);
  };

  const formatPrice = (price, currency = 'CLP') => {
    if (price === null || price === undefined || price === '') return '';
    const n = Number(price);
    if (Number.isNaN(n)) return String(price);
    try {
      const formatted = new Intl.NumberFormat('es-CL').format(n);
      return currency ? `${formatted} ${currency}` : formatted;
    } catch {
      return `${n} ${currency || ''}`.trim();
    }
  };

  const safePlaceholder = (type) => {
    const base = 'https://placehold.co';
    const map = {
      post: `${base}/1080x1080/png?text=Post+Preview`,
      reel: `${base}/1080x1920/png?text=Reel+Preview`,
      story: `${base}/1080x1920/png?text=Story+Preview`,
      carousel: `${base}/1080x1080/png?text=Carousel+Preview`
    };
    return map[type] || map.post;
  };

  const loadProducts = async () => {
    try {
      // Read cached catalog first. Synchronization is an explicit user action.

      // Nota: intento leer image_urls si existe, sino no pasa nada
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, price, currency, image_url, image_urls, video_url, shopify_product_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (data) setProducts(data);
    } catch (e) {
      console.error('loadProducts error:', e);
      setStatusMsg({
        type: 'info',
        text: 'No pude sincronizar/leer productos. Revisa sync-shopify-products o la tabla products.'
      });
      clearStatusSoon(4500);
    }
  };

  // --- Helpers for images (si tienes arrays en products)
  const normalizeImageList = (product) => {
    const list =
      Array.isArray(product?.image_urls) ? product.image_urls :
      Array.isArray(product?.images) ? product.images :
      null;

    const urls = (list || [])
      .map((x) => (typeof x === 'string' ? x : x?.url))
      .filter(Boolean);

    if (product?.image_url) urls.unshift(product.image_url);
    // unique
    return Array.from(new Set(urls));
  };

  const pickRandom = (arr) => {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const pickCarousel = (arr, n = 3) => {
    if (!arr || !arr.length) return [];
    if (arr.length <= n) return arr.slice(0, n);
    // shuffle copy
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };

  const buildPayload = (product) => {
    const images = normalizeImageList(product);

    const carousel_urls = contentType === 'carousel'
      ? pickCarousel(images, 3)
      : [];

    // ✅ REGLA: product.video_url (MP4) > Video URL manual (MP4)
    const mp4FromProduct = isMp4Url(product?.video_url) ? String(product.video_url).trim() : null;
    const mp4FromManual = isMp4Url(videoUrl) ? String(videoUrl).trim() : null;
    const mp4 = mp4FromProduct || mp4FromManual || null;

    // ✅ preview_url puede ser MP4 si es reel (el UI ya no rompe: muestra <video>)
    const primary =
      contentType === 'reel'
        ? (mp4 || pickRandom(images) || product?.image_url || null)
        : (
            contentType === 'post' || contentType === 'story'
              ? (pickRandom(images) || product?.image_url || null)
              : (images[0] || product?.image_url || null)
          );

    return {
      campaign_type: campaignType,
      platform,
      content_type: contentType,
      product_id: product?.id ?? null,
      product_name: product?.name || 'Producto Keloke',
      product_price: product?.price ?? null,
      product_description: product?.description || '',
      brief,
      destination_url: destinationUrl,
      product_currency: product?.currency || 'CLP',
      product_image_url: product?.image_url || null,

      product_images: images,
      carousel_urls,

      strategy,
      tone,
      ab_variant: campaignType === 'paid' ? abVariant : null,
      age_range: campaignType === 'paid' ? ageRange : null,
      interests: campaignType === 'paid' ? interests : null,
      generated_at: new Date().toISOString(),

      preview_url: primary || null,

      // ✅ si es reel y hay MP4, mandamos MP4 como video_asset_url
      video_asset_url: contentType === 'reel' ? mp4 : null,
    };
  };

  const generateViaEdgeFunction = async (payload) => {
    try {
      if (genAbortRef.current) genAbortRef.current.abort();
    } catch {}

    const controller = new AbortController();
    genAbortRef.current = controller;

    const timeoutMs = 95000;
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: payload,
        signal: controller.signal,
      });
      if (error) {const detail=await error.context?.json?.().catch(()=>null);throw new Error(detail?.error||error.message||'La IA no pudo completar la generación.');}
      if(!data?.ok)throw new Error(data?.error||'La IA no pudo completar la generación.');
      return data;
    } finally {
      clearTimeout(t);
    }
  };

  const normalizeGenerated = (raw, payload, product) => {
    const fallback = {title:'',body:'',caption:'',hashtags:'',cta:'',preview_url:null};
    if (!raw || typeof raw !== 'object' || !raw.ok || !raw.title || !raw.caption) throw new Error('No hay contenido generado por IA.');

    const mp4 = payload?.video_asset_url || null;

    return {
      ...raw,
      title: raw.title ?? fallback.title,
      body: raw.body ?? fallback.body,
      caption: raw.caption ?? fallback.caption,
      hashtags: raw.hashtags ?? fallback.hashtags,
      cta: raw.cta ?? fallback.cta,

      preview_url: raw.preview_url ?? payload?.preview_url ?? product?.image_url ?? fallback.preview_url,

      // ✅ si es reel, forzamos asset_url al MP4 (si existe)
      asset_url: (payload?.content_type === 'reel' && mp4) ? mp4 : (raw.asset_url ?? null),
      asset_type: (payload?.content_type === 'reel' && mp4) ? 'video' : (raw.asset_type ?? null),

      carousel_urls: Array.isArray(raw.carousel_urls) ? raw.carousel_urls : (payload.carousel_urls || []),

      provider: raw.provider ?? 'supabase',
      model: raw.model ?? null,
    };
  };

  const saveGeneratedToSupabase = async (payload, product, content) => {
    const insertRow = {
      campaign_type: payload.campaign_type,
      platform: payload.platform,
      content_type: payload.content_type,
      product_id: product?.id ?? null,

      title: content.title,
      body: content.body,
      caption: content.caption,
      hashtags: content.hashtags,
      cta: content.cta,

      strategy: payload.strategy,
      ab_variant: payload.campaign_type === 'paid' ? payload.ab_variant : null,
      target_age_range: payload.campaign_type === 'paid' ? payload.age_range : null,
      target_interests: payload.campaign_type === 'paid' ? payload.interests : null,
      tone: payload.tone,

      preview_url: content.preview_url ?? null,
      status: 'draft',

      asset_url: content.asset_url ?? null,
      asset_type: content.asset_type ?? null,
      creative_payload: {variants:content.variants||[],scene_script:content.scene_script||[],voiceover_script:content.voiceover_script||'',on_screen_text:content.on_screen_text||[],hook_0_2s:content.hook_0_2s||'',image_prompt:content.image_prompt||'',creative_rationale:content.creative_rationale||'',model:content.model,brief:payload.brief,destination_url:payload.destination_url},
    };

    const { data: saved, error } = await supabase
      .from('generated_content')
      .insert([insertRow])
      .select()
      .single();

    if (error) throw error;
    return saved;
  };

  const startWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      requestLockRef.current = false;
      setLoading(false);
      setPublishLoading(false);
      setStatusMsg({
        type: 'info',
        text: 'Se liberó el estado de carga por seguridad (watchdog). Si pasa seguido, el timeout viene del backend.'
      });
      clearStatusSoon(4500);
    }, 100000);
  };

  const stopWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };

  const generateContent = async () => {
    if (requestLockRef.current) return;

    if (!selectedProduct && products.length > 0) {
      setStatusMsg({ type: 'err', text: 'Selecciona un producto.' });
      clearStatusSoon();
      return;
    }

    requestLockRef.current = true;
    setLoading(true);
    setStatusMsg(null);
    startWatchdog();

    try {
      const product = products.find(p => String(p.id) === String(selectedProduct)) || products[0] || null;
      const payload = buildPayload(product);
      setLastRequest({ payload, product });

      const raw = await generateViaEdgeFunction(payload);

      const content = normalizeGenerated(raw, payload, product);
      const savedContent = await saveGeneratedToSupabase(payload, product, content);

      setGeneratedContent({
        ...content,
        id: savedContent?.id ?? null,
        saved_at: new Date().toISOString(),
      });

      loadDrafts();
      setStatusMsg({ type: 'ok', text: '✅ Contenido generado y guardado.' });
      clearStatusSoon();
    } catch (error) {
      console.error('Error generando contenido:', error);
      setStatusMsg({ type: 'err', text: error.message || 'No pudimos generar el contenido.' });
      clearStatusSoon(3500);

    } finally {
      stopWatchdog();
      setLoading(false);
      requestLockRef.current = false;
    }
  };

  const regenerateContent = async () => {
    if (requestLockRef.current) return;

    if (!lastRequest) {
      await generateContent();
      return;
    }

    requestLockRef.current = true;
    setLoading(true);
    setStatusMsg(null);
    startWatchdog();

    try {
      const { payload, product } = lastRequest;

      const raw = await generateViaEdgeFunction({ ...payload, regenerate:true });

      const content = normalizeGenerated(raw, payload, product);
      const savedContent = await saveGeneratedToSupabase(payload, product, content);

      setGeneratedContent({
        ...content,
        id: savedContent?.id ?? null,
        saved_at: new Date().toISOString(),
      });

      loadDrafts();
      setStatusMsg({ type: 'ok', text: '✅ Regenerado y guardado.' });
      clearStatusSoon();
    } catch (e) {
      console.error('regenerateContent error:', e);
      setStatusMsg({ type: 'err', text: e.message || 'No pudimos regenerar el contenido.' });
      clearStatusSoon(3500);

    } finally {
      stopWatchdog();
      setLoading(false);
      requestLockRef.current = false;
    }
  };

  const rejectContent = async () => {
    if (!generatedContent?.id) {
      setGeneratedContent(null);
      setStatusMsg({ type: 'ok', text: '✅ Preview limpiado.' });
      clearStatusSoon();
      return;
    }

    try {
      const {error}=await supabase.from('generated_content').update({status:'rejected'}).eq('id',generatedContent.id).eq('status','draft');
      if(error)throw error;

      setGeneratedContent(null);
      setStatusMsg({ type: 'ok', text: '✅ Contenido rechazado. Puedes regenerar otro.' });
      clearStatusSoon(3500);
    } catch (e) {
      console.error('rejectContent error:', e);
      setStatusMsg({ type: 'err', text: '❌ No pude marcar como rechazado.' });
      clearStatusSoon(3500);
    }
  };

  // ---- Caption FINAL (lo que realmente publicamos)
  const stripFrameworkLabels = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/^ATENCIÓN:\s*/gim, '')
      .replace(/^INTERÉS:\s*/gim, '')
      .replace(/^DESEO:\s*/gim, '')
      .replace(/^ACCIÓN:\s*/gim, '')
      .replace(/^PROBLEMA:\s*/gim, '')
      .replace(/^AGITACIÓN:\s*/gim, '')
      .replace(/^SOLUCIÓN:\s*/gim, '')
      .trim();
  };

  const buildPublishCaption = (content,p) => buildCreativeCaption(content,p);

  const publishContent = async () => {
    if (!generatedContent) return;

    // ✅ bloqueo inteligente: YouTube necesita MP4 sí o sí
    if (platform === 'youtube' && contentType === 'reel') {
      const u = (generatedContent.asset_url || '').toLowerCase();
      if (!u.includes('.mp4') && generatedContent.asset_type !== 'video') {
        setStatusMsg({ type: 'err', text: 'YouTube requiere un MP4 público. Pega Video URL (MP4) y regenera.' });
        clearStatusSoon(4500);
        setPublishLoading(false);
        stopWatchdog();
        return;
      }
    }

    if (platform === 'tiktok') {
      setStatusMsg({ type: 'info', text: 'Descarga el MP4 del Estudio visual y usa Compartir copy para completar la publicación en TikTok. La publicación directa requiere que TikTok apruebe ese permiso.' });
      clearStatusSoon(3500);
      return;
    }
    if (publishLoading) return;

    setPublishLoading(true);
    setStatusMsg(null);
    startWatchdog();

    try {
      const finalCaption = buildPublishCaption(
        {
          title: generatedContent.title,
          caption: generatedContent.caption,
          body: generatedContent.body,
          cta: generatedContent.cta,
          hashtags: generatedContent.hashtags,
        },
        platform
      );

      const shouldRetryPublish = (data) => {
        if (!data || typeof data !== 'object') return false;
        const msg = JSON.stringify(data).toLowerCase();
        return (
          msg.includes('not_ready') ||
          msg.includes('processing') ||
          msg.includes('media not ready') ||
          msg.includes('temporarily unavailable')
        );
      };

      const payload = {
        platform,
        content_type: contentType,
        campaign_type: campaignType,
        generated_content_id: generatedContent.id ?? null,
        content: {
          title: generatedContent.title,
          body: generatedContent.body,
          caption: finalCaption,
          hashtags: generatedContent.hashtags,
          cta: generatedContent.cta,
          preview_url: generatedContent.preview_url ?? null,
          asset_url: generatedContent.asset_url ?? null,
          asset_type: generatedContent.asset_type ?? null,
          carousel_urls: Array.isArray(generatedContent.carousel_urls) ? generatedContent.carousel_urls : [],
        },
        targeting: campaignType === 'paid'
          ? { ab_variant: abVariant, age_range: ageRange, interests }
          : null,
      };

      let attempt = 0;
      const maxRetries = 3;
      const delayMs = 15000;
      let data = null;

      while (attempt < maxRetries) {
        const res = await supabase.functions.invoke('publish-content', { body: payload });

        if (res.error) throw res.error;

        data = res.data;

        if (shouldRetryPublish(data)) {
          attempt++;
          if (attempt >= maxRetries) break;

          setStatusMsg({
            type: 'info',
            text: `⏳ Instagram está procesando el video… reintentando (${attempt}/${maxRetries})`
          });

          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        break;
      }

      if (!data) {
        throw new Error('No se pudo publicar tras varios intentos.');
      }

      if (generatedContent.id) {
        await supabase
          .from('generated_content')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
            publish_response: typeof data === 'object' ? data : { data }
          })
          .eq('id', generatedContent.id);
      }

      setStatusMsg({ type: 'ok', text: '✅ Publicación enviada al backend.' });
      clearStatusSoon();
      alert('✅ Publicación enviada. (El backend procesa la publicación a la red seleccionada)');
    } catch (e) {
      console.error('publishContent error:', e);
      setStatusMsg({ type: 'err', text: '❌ Error al publicar (publish-content).' });
      clearStatusSoon(3500);
      alert('❌ Error al publicar. Revisa logs de Supabase Edge Function publish-content.');
    } finally {
      stopWatchdog();
      setPublishLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMsg({ type: 'ok', text: '✅ Copiado al portapapeles.' });
      clearStatusSoon();
    } catch (e) {
      console.error('clipboard error:', e);
      alert('No pude copiar al portapapeles.');
    }
  };

  const downloadText = () => {
    if (!generatedContent) return;
    const content = `${generatedContent.title}\n\n${generatedContent.body}\n\n${generatedContent.caption}\n\n${generatedContent.hashtags}\n\n${generatedContent.cta}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contenido-${platform}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsset = async () => {
    if (!generatedContent) return;

    const assetUrl = generatedContent.asset_url || generatedContent.preview_url;
    if (!assetUrl) {
      alert('No hay asset para descargar.');
      return;
    }

    try {
      const res = await fetch(assetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const lower = String(assetUrl).toLowerCase();
      const extGuess =
        generatedContent.asset_type === 'video' || lower.includes('.mp4') ? 'mp4' :
        generatedContent.asset_type === 'image' ? 'png' :
        'bin';

      a.download = `asset-${platform}-${Date.now()}.${extGuess}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('downloadAsset error:', e);
      alert('No pude descargar el asset (revisa la URL).');
    }
  };

  const scheduleContent = async (scheduleData) => {
  try {
    if (!generatedContent) return;

    const caption_final = buildPublishCaption(
      {
        title: generatedContent.title,
        caption: generatedContent.caption,
        body: generatedContent.body,
        cta: generatedContent.cta,
        hashtags: generatedContent.hashtags,
      },
      platform
    );

    // ✅ IMPORTANTE: content_calendar NO tiene generated_content_id
    const row = {
      platform,
      content_type: contentType,
      title: generatedContent.title ?? null,
      description: generatedContent.body ?? null,
      caption: caption_final ?? null,
      hashtags: generatedContent.hashtags ?? null,
      cta: generatedContent.cta ?? null,

      preview_url: generatedContent.preview_url ?? null,
      asset_url: generatedContent.asset_url ?? null,
      asset_type: generatedContent.asset_type ?? null,

      scheduled_date: scheduleData.date,
      scheduled_time: scheduleData.time, // la columna es time WITHOUT timezone, acepta "HH:MM"
      product_id: selectedProduct || null,

      status: 'scheduled',
      campaign_type: campaignType,
      ab_variant: campaignType === 'paid' ? abVariant : null,
      target_age_range: campaignType === 'paid' ? ageRange : null,
      target_interests: campaignType === 'paid' ? interests : null,
    };

    const { error } = await supabase.from('content_calendar').insert([row]);
    if (error) throw error;

    setShowScheduleModal(false);
    window.dispatchEvent(new CustomEvent('calendar:refresh'));
    alert('Contenido guardado en el calendario. La publicación automática requiere completar la verificación del programador y del canal.');
  } catch (error) {
    console.error('Error scheduling content:', error);
    alert(`❌ Error al programar contenido: ${error?.message || JSON.stringify(error)}`);
  }
};

  const compiledTextForCopy = useMemo(() => {
    if (!generatedContent) return '';
    return buildCreativeCaption(generatedContent,platform);
  }, [generatedContent,platform]);

  // ✅ Preview helpers (no rompe si preview_url es MP4)
  const isVideoPreview = useMemo(() => {
    if (!generatedContent) return false;
    const u1 = String(generatedContent.asset_url || '').toLowerCase();
    const u2 = String(generatedContent.preview_url || '').toLowerCase();
    return (
      contentType === 'reel' &&
      (generatedContent.asset_type === 'video' || u1.includes('.mp4') || u2.includes('.mp4'))
    );
  }, [generatedContent, contentType]);

  const previewSrc = useMemo(() => {
    if (!generatedContent) return '';
    return generatedContent.asset_url || generatedContent.preview_url || safePlaceholder(contentType);
  }, [generatedContent, contentType]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#173d31' }}>
            Estudio de publicidad
          </h1>
          <p className="text-gray-600 mt-1">
            Copy, fotografía y graphic motion para tus productos y redes sociales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6" style={{ color: '#6e9942' }} />
          <span className="text-sm font-medium" style={{ color: '#173d31' }}>
            {engine?.openai?.text_model || 'Motor pendiente de comprobar'}
          </span>
        </div>
      </div>

      <div className="panel p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap"><div><h3 className="text-sm font-semibold">Dirección de la campaña</h3><p className="text-xs text-gray-500 mt-1">Cuenta qué quieres destacar y entrega solo condiciones comerciales confirmadas.</p></div><button className="subtle-button" disabled={checkingEngine} onClick={checkEngine}><RefreshCw size={14} className={checkingEngine?'animate-spin':''}/>Actualizar conexión IA</button></div>
        <label className="block text-xs font-medium" htmlFor="campaign-brief">Objetivo y mensaje</label><textarea id="campaign-brief" value={brief} maxLength={2000} onChange={e=>setBrief(e.target.value)} rows={2} className="w-full p-3 border rounded-lg text-sm" placeholder="Ej.: presentar el producto, mostrar su uso y resolver una duda frecuente. Indica aquí descuentos o envío solo si están confirmados."/>
        <label className="block text-xs font-medium" htmlFor="campaign-destination">Enlace de compra (opcional)</label><input id="campaign-destination" type="url" value={destinationUrl} onChange={e=>setDestinationUrl(e.target.value)} className="w-full p-3 border rounded-lg text-sm" placeholder="https://tu-tienda.cl/products/..."/>
      </div>
      {drafts.length>0&&<div className="panel p-4 flex items-center gap-3 flex-wrap"><label htmlFor="creative-drafts" className="text-xs font-semibold">Continuar un borrador</label><select id="creative-drafts" className="text-sm border rounded-lg p-2 max-w-full" value="" onChange={e=>restoreDraft(e.target.value)}><option value="" disabled>Elige uno de tus últimos borradores</option>{drafts.map(draft=><option key={draft.id} value={draft.id}>{draft.title} · {draft.platform}</option>)}</select></div>}
      {/* Status */}
      {statusMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusMsg.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : statusMsg.type === 'info'
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-1 space-y-4">
          {/* Campaign */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: '#173d31' }}>
              <Target className="w-4 h-4" />
              Tipo de Campaña
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => setCampaignType('organic')}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  campaignType === 'organic'
                    ? 'border-opacity-100 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={campaignType === 'organic' ? { borderColor: '#173d31', backgroundColor: '#edf3e7' } : {}}
              >
                <p className="font-medium text-sm">📱 Contenido Orgánico</p>
                <p className="text-xs text-gray-500 mt-1">Posts, reels, historias</p>
              </button>

              <button
                onClick={() => setCampaignType('paid')}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  campaignType === 'paid'
                    ? 'border-opacity-100 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={campaignType === 'paid' ? { borderColor: '#173d31', backgroundColor: '#edf3e7' } : {}}
              >
                <p className="font-medium text-sm">💰 Campañas Pagadas</p>
                <p className="text-xs text-gray-500 mt-1">Meta Ads, TikTok Ads</p>
              </button>
            </div>
          </div>

          {/* Platform */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3" style={{ color: '#173d31' }}>Plataforma</h3>
            <div className="grid grid-cols-2 gap-2">
              {platformMeta.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    platform === p.id
                      ? 'border-opacity-100 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={platform === p.id ? { borderColor: '#173d31', backgroundColor: '#edf3e7' } : {}}
                >
                  <p className="font-medium text-xs">{p.emoji} {p.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Content type */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3" style={{ color: '#173d31' }}>Formato</h3>
            <div className="space-y-2">
              {[
                { id: 'post', name: 'Post', icon: FileText },
                { id: 'reel', name: 'Reel/Video', icon: Video },
                { id: 'story', name: 'Historia', icon: ImageIcon },
                { id: 'carousel', name: 'Carrusel', icon: ImageIcon }
              ].map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setContentType(type.id)}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left flex items-center gap-3 ${
                      contentType === type.id
                        ? 'border-opacity-100 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={contentType === type.id ? { borderColor: '#173d31', backgroundColor: '#edf3e7' } : {}}
                  >
                    <Icon className="w-4 h-4" />
                    <p className="font-medium text-sm">{type.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="lg:col-span-2 space-y-4">
          {/* Form */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2" style={{ color: '#173d31' }}>
                <Wand2 className="w-5 h-5" />
                Configuración de Contenido
              </h3>
              <Sparkles className="w-5 h-5" style={{ color: '#6e9942' }} />
            </div>

            <div className="space-y-4">
              {/* Product */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Producto o Tema
                </label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                >
                  <option value="">Selecciona un producto</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} - ${formatPrice(product.price, product.currency || 'CLP')}
                    </option>
                  ))}
                </select>
              </div>

              {/* ✅ Video URL (MP4) - SOLO en Reel/Video y plataformas con video */}
              {contentType === 'reel' && ['youtube', 'instagram', 'facebook'].includes(platform) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video URL (MP4 público)
                  </label>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://.../video.mp4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Prioridad: <b>product.video_url (MP4)</b> → <b>este input</b>. Si no hay MP4, YouTube fallará.
                  </p>
                </div>
              )}

              {/* Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estrategia de Contenido
                </label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                >
                  <option value="aida">AIDA (Atención, Interés, Deseo, Acción)</option>
                  <option value="pas">PAS (Problema, Agitación, Solución)</option>
                  <option value="storytelling">Storytelling (Historia)</option>
                  <option value="gatillo">Gatillo Mental (Urgencia/Escasez)</option>
                </select>
              </div>

              {/* Tone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tono de Comunicación
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                >
                  <option value="profesional">Profesional</option>
                  <option value="casual">Casual y Cercano</option>
                  <option value="energico">Enérgico y Motivador</option>
                  <option value="educativo">Educativo</option>
                </select>
              </div>

              {campaignType === 'paid' && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-sm mb-3" style={{ color: '#173d31' }}>
                    🎯 Configuración de Campaña Pagada
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Variante A/B Testing
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {['A', 'B', 'C'].map(variant => (
                          <button
                            key={variant}
                            onClick={() => setAbVariant(variant)}
                            className={`p-2 rounded-lg border-2 transition-all font-medium ${
                              abVariant === variant
                                ? 'border-opacity-100'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            style={abVariant === variant ? { borderColor: '#173d31', backgroundColor: '#edf3e7' } : {}}
                          >
                            Variante {variant}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Rango de Edad
                        </label>
                        <input
                          type="text"
                          value={ageRange}
                          onChange={(e) => setAgeRange(e.target.value)}
                          placeholder="ej: 25-45"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Intereses
                        </label>
                        <input
                          type="text"
                          value={interests}
                          onChange={(e) => setInterests(e.target.value)}
                          placeholder="ej: Cocina, Hogar"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={generateContent}
                disabled={loading || (!selectedProduct && products.length > 0)}
                className="w-full py-4 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#173d31' }}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Generando contenido con IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generar Contenido Automático
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview */}
          {generatedContent && <>
            {Array.isArray(generatedContent.variants)&&generatedContent.variants.length>0&&<section className="panel p-5 mb-5"><h3 className="text-sm font-semibold mb-3">Tres ángulos para tu campaña</h3><div className="grid sm:grid-cols-3 gap-3">{generatedContent.variants.map((variant,i)=><div key={i} className="border rounded-xl p-4"><p className="eyebrow">{variant.angle}</p><h4 className="text-sm font-semibold my-2">{variant.headline}</h4><p className="text-xs text-gray-600 leading-relaxed">{variant.caption}</p><button className="text-link mt-3" onClick={async()=>{const patch={title:variant.headline,caption:variant.caption,body:variant.caption,cta:variant.cta};const {error}=await supabase.from('generated_content').update(patch).eq('id',generatedContent.id).eq('status','draft');if(error){setStatusMsg({type:'err',text:'No pudimos guardar esta variante.'});return}setGeneratedContent(previous=>({...previous,...patch}));}}>Usar este ángulo</button></div>)}</div></section>}
            <CreativeStudioTools content={generatedContent} product={activeProduct} onAsset={setCreativeAsset}/>
          </>}
          {generatedContent && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2" style={{ color: '#173d31' }}>
                  <Eye className="w-5 h-5" />
                  Vista Previa del Contenido
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(compiledTextForCopy)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Copiar contenido"
                  >
                    <Copy className="w-4 h-4" style={{ color: '#173d31' }} />
                  </button>

                  <button
                    onClick={downloadText}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Descargar texto"
                  >
                    <Download className="w-4 h-4" style={{ color: '#173d31' }} />
                  </button>

                  <button
                    onClick={downloadAsset}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Descargar imagen/video (si existe)"
                  >
                    <ImageIcon className="w-4 h-4" style={{ color: '#173d31' }} />
                  </button>

                  <button
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Compartir copy"
                    onClick={async () => {try{if(navigator.share)await navigator.share({title:generatedContent.title,text:compiledTextForCopy});else await copyToClipboard(compiledTextForCopy);}catch(e){if(e.name!=='AbortError')setStatusMsg({type:'err',text:'No pudimos compartir el contenido.'})}}}
                  >
                    <Share2 className="w-4 h-4" style={{ color: '#173d31' }} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center border-2 border-gray-200 overflow-hidden">
                    {isVideoPreview ? (
                      <video
                        src={previewSrc}
                        controls
                        className="w-full h-full object-cover"
                        onError={() => {
                          // fallback visual (no romper)
                          setStatusMsg({ type: 'info', text: 'No pude cargar el video preview. Revisa que el MP4 sea público.' });
                          clearStatusSoon(4500);
                        }}
                      />
                    ) : (
                      <img
                        src={previewSrc || safePlaceholder(contentType)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = safePlaceholder(contentType); }}
                      />
                    )}
                  </div>

                  {Array.isArray(generatedContent.carousel_urls) && generatedContent.carousel_urls.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      Carrusel: {generatedContent.carousel_urls.length} imágenes
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-600">
                    <span className="capitalize">{platform}</span>
                    <span>•</span>
                    <span className="capitalize">{contentType}</span>
                    {campaignType === 'paid' && (
                      <>
                        <span>•</span>
                        <span className="font-medium" style={{ color: '#6e9942' }}>
                          Variante {abVariant}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">TÍTULO</label>
                    <p className="font-bold text-lg" style={{ color: '#173d31' }}>
                      {generatedContent.title}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">DESCRIPCIÓN</label>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {generatedContent.body}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">CAPTION (PUBLICACIÓN)</label>
                    <p className="text-sm font-medium whitespace-pre-line" style={{ color: '#173d31' }}>
                      {buildPublishCaption(
                        {
                          title: generatedContent.title,
                          body: generatedContent.body,
                          cta: generatedContent.cta,
                          hashtags: generatedContent.hashtags,
                        },
                        platform
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      *Esto es lo que realmente se enviará a la red (IG usa solo caption).*
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">HASHTAGS</label>
                    <p className="text-sm text-blue-600">
                      {generatedContent.hashtags}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">LLAMADO A LA ACCIÓN</label>
                    <div
                      className="inline-block px-4 py-2 rounded-lg text-white font-medium text-sm"
                      style={{ backgroundColor: '#173d31' }}
                    >
                      {generatedContent.cta}
                    </div>
                  </div>

                  {campaignType === 'paid' && (
                    <div className="border-t pt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-2">SEGMENTACIÓN</label>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" style={{ color: '#173d31' }} />
                          <span>{ageRange} años</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="w-4 h-4" style={{ color: '#173d31' }} />
                          <span>{interests || 'General'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="flex-1 min-w-[220px] py-3 rounded-lg font-medium text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: '#173d31' }}
                >
                  📅 Programar Publicación
                </button>

                <button
                  onClick={publishContent}
                  disabled={publishLoading}
                  className="flex-1 min-w-[160px] py-3 rounded-lg font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#6e9942' }}
                >
                  {publishLoading ? 'Publicando...' : '🚀 Publicar'}
                </button>

                <button
                  onClick={rejectContent}
                  className="flex-1 min-w-[160px] py-3 rounded-lg font-medium border-2 transition-all hover:bg-gray-50"
                  style={{ borderColor: '#b91c1c', color: '#b91c1c' }}
                >
                  ❌ Rechazar
                </button>

                <button
                  onClick={regenerateContent}
                  className="px-6 py-3 rounded-lg font-medium border-2 border-gray-300 text-gray-700 transition-all hover:bg-gray-50"
                  title="Regenerar"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {platform === 'tiktok' && (
                <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                  TikTok está en modo manual por ahora (copiar/pegar). Se activa cuando Meta/Apps esté aprobado.
                </div>
              )}
            </div>
          )}

          {!generatedContent && !loading && (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100">
              <div className="text-center">
                <Sparkles className="w-16 h-16 mx-auto mb-4" style={{ color: '#6e9942' }} />
                <h3 className="font-bold text-xl mb-2" style={{ color: '#173d31' }}>
                  Genera tu primer contenido
                </h3>
                <p className="text-gray-600 mb-6">
                  Configura los parámetros y presiona "Generar Contenido Automático" para crear contenido optimizado con IA
                </p>
                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: '#edf3e7' }}>
                      <TrendingUp className="w-6 h-6" style={{ color: '#173d31' }} />
                    </div>
                    <p className="text-xs text-gray-600">Optimizado para engagement</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: '#edf3e7' }}>
                      <Target className="w-6 h-6" style={{ color: '#173d31' }} />
                    </div>
                    <p className="text-xs text-gray-600">Segmentación precisa</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: '#edf3e7' }}>
                      <Zap className="w-6 h-6" style={{ color: '#173d31' }} />
                    </div>
                    <p className="text-xs text-gray-600">Generación instantánea</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && generatedContent && (
        <ScheduleModalContent
          onClose={() => setShowScheduleModal(false)}
          onSchedule={scheduleContent}
          platform={platform}
        />
      )}
    </div>
  );
}

// Schedule Modal Component
function ScheduleModalContent({ onClose, onSchedule, platform }) {
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduleTime, setScheduleTime] = useState('09:00');

  const optimalTimes = {
    instagram: ['09:00', '13:00', '19:00', '21:00'],
    tiktok: ['12:00', '18:00', '20:00', '22:00'],
    facebook: ['08:00', '12:00', '17:00', '20:00'],
    youtube: ['14:00', '19:00', '21:00'],
    whatsapp: ['10:00', '15:00', '18:00']
  };

  const suggestedTimes = optimalTimes[platform] || optimalTimes.instagram;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSchedule({ date: scheduleDate, time: scheduleTime });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold" style={{ color: '#173d31' }}>
              📅 Programar Publicación
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha de Publicación
            </label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hora de Publicación
            </label>
            <select
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
              required
            >
              {['08:00', '09:00', '10:00', '12:00', '13:00', '14:00', '15:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>

          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4" style={{ color: '#173d31' }} />
              <p className="font-medium text-sm" style={{ color: '#173d31' }}>
                Horarios Recomendados para {platform}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedTimes.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setScheduleTime(time)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                    scheduleTime === time
                      ? 'text-white'
                      : 'bg-white border border-green-300 hover:border-green-400'
                  }`}
                  style={scheduleTime === time ? { backgroundColor: '#173d31' } : {}}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 rounded-lg text-white font-medium transition-all hover:opacity-90"
              style={{ backgroundColor: '#173d31' }}
            >
              Programar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

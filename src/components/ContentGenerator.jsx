// ContentGenerator.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  FileText, Image as ImageIcon, Video, Sparkles,
  Download, Copy, Share2, Eye, Wand2, RefreshCw,
  TrendingUp, Target, Users, Zap
} from 'lucide-react';

/**
 * ContentGenerator.jsx (FULL - GOD MODE)
 *
 * Fixes:
 * - Anti-freeze: lock + abort + timeout + watchdog
 * - Caption FINAL consistente (lo que se publica = lo que se programa)
 * - Programación guarda generated_content_id (si existe) y caption final
 * - No asume columnas nuevas obligatorias en DB
 */

export default function ContentGenerator() {
  const [loading, setLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

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
  {/* Video URL (solo si es Reel/Video y plataforma soporta video) */}
{contentType === 'reel' && ['youtube','instagram','facebook'].includes(platform) && (
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
      Debe ser un link directo a .mp4 (público). Si no hay MP4, YouTube fallará.
    </p>
  </div>
)}
  

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
      // opcional: sincroniza
      await supabase.functions.invoke('sync-shopify-products', { body: { limit: 100 } });

      // Nota: intento leer image_urls si existe, sino no pasa nada
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, currency, image_url, image_urls, shopify_product_id, created_at')
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

  // ✅ Si es reel/video, priorizamos MP4
  const mp4 =
    (videoUrl && videoUrl.trim()) ||
    product?.video_url ||
    null;

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

    // ✅ NUEVO: si es reel, mandamos MP4 como "video_asset_url"
    video_asset_url: contentType === 'reel' ? mp4 : null,
  };
};

  const generateViaEdgeFunction = async (payload) => {
    try {
      if (genAbortRef.current) genAbortRef.current.abort();
    } catch {}

    const controller = new AbortController();
    genAbortRef.current = controller;

    const timeoutMs = 25000;
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: payload,
        signal: controller.signal,
      });
      if (error) throw error;
      return data;
    } finally {
      clearTimeout(t);
    }
  };

  const normalizeGenerated = (raw, payload, product) => {
  const fallback = generateContentByStrategy(payload, product);
  if (!raw || typeof raw !== 'object') return fallback;

  const mp4 = payload?.video_asset_url || null;

  return {
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
    };

    // Intento guardar carousel_urls si existe columna jsonb (si no existe, no rompe: lo omitimos)
    // Para no romper DB, hacemos insert sin ese campo. (Si quieres lo agregamos cuando confirmes columna)
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
    }, 35000);
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

      let raw = null;
      try {
        raw = await generateViaEdgeFunction(payload);
      } catch (edgeErr) {
        const msg = String(edgeErr?.message || edgeErr);
        console.error('generate-content failed:', edgeErr);

        if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
          setStatusMsg({ type: 'info', text: 'Timeout en generate-content. Usé generador local como respaldo.' });
        } else {
          setStatusMsg({ type: 'info', text: 'generate-content falló. Usé generador local como respaldo.' });
        }
        clearStatusSoon(3500);
        raw = null;
      }

      const content = normalizeGenerated(raw, payload, product);
      const savedContent = await saveGeneratedToSupabase(payload, product, content);

      setGeneratedContent({
        ...content,
        id: savedContent?.id ?? null,
        saved_at: new Date().toISOString(),
      });

      setStatusMsg({ type: 'ok', text: '✅ Contenido generado y guardado.' });
      clearStatusSoon();
    } catch (error) {
      console.error('Error generando contenido:', error);
      setStatusMsg({ type: 'err', text: '❌ Error al generar contenido. Revisa logs.' });
      clearStatusSoon(3500);
      alert('Error al generar contenido. Intenta nuevamente.');
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

      let raw = null;
      try {
        raw = await generateViaEdgeFunction({ ...payload, regenerate: true });
      } catch (edgeErr) {
        console.error('regenerate generate-content failed:', edgeErr);
        setStatusMsg({ type: 'info', text: 'Timeout/fallo en regenerate. Usé respaldo local.' });
        clearStatusSoon(3500);
        raw = null;
      }

      const content = normalizeGenerated(raw, payload, product);
      const savedContent = await saveGeneratedToSupabase(payload, product, content);

      setGeneratedContent({
        ...content,
        id: savedContent?.id ?? null,
        saved_at: new Date().toISOString(),
      });

      setStatusMsg({ type: 'ok', text: '✅ Regenerado y guardado.' });
      clearStatusSoon();
    } catch (e) {
      console.error('regenerateContent error:', e);
      setStatusMsg({ type: 'err', text: '❌ No pude regenerar.' });
      clearStatusSoon(3500);
      alert('Error al regenerar contenido.');
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
      await supabase
        .from('generated_content')
        .update({ status: 'rejected', rejected_at: new Date().toISOString() })
        .eq('id', generatedContent.id);

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

  const buildPublishCaption = ({ title, body, cta, hashtags }, p) => {
    const cleanBody = stripFrameworkLabels(body);
    const cleanTitle = stripFrameworkLabels(title);
    const hash = (hashtags || '').trim();
    const ctaLine = cta ? `\n\n${cta}` : '';

    // IG/FB usan caption/message
    const base = `${cleanTitle}\n\n${cleanBody}${ctaLine}\n\n${hash}`.replace(/\n{3,}/g, '\n\n').trim();

    if (p === 'whatsapp') {
      return base.slice(0, 900).trim();
    }
    return base;
  };

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
      setStatusMsg({ type: 'info', text: 'TikTok queda en modo manual: copiar/pegar (placeholder).' });
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

          // 🔥 carrusel_urls opcional (publish-content los soporta ahora)
          carousel_urls: Array.isArray(generatedContent.carousel_urls) ? generatedContent.carousel_urls : [],
        },
        targeting: campaignType === 'paid'
          ? { ab_variant: abVariant, age_range: ageRange, interests }
          : null,
      };

      let attempt = 0;
let maxRetries = 3;
let delayMs = 15000; // 15 segundos
let data = null;

while (attempt < maxRetries) {
  const res = await supabase.functions.invoke('publish-content', { body: payload });

  if (res.error) throw res.error;

  data = res.data;

  // ✅ Si Instagram aún está procesando el video → reintento automático
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

  // ✅ Publicado correctamente
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

      const extGuess =
        generatedContent.asset_type === 'video' ? 'mp4' :
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

      // ✅ Guardamos caption FINAL (lo que se publica)
      const caption_final = buildPublishCaption(
        {
          title: generatedContent.title,
          body: generatedContent.body,
          cta: generatedContent.cta,
          hashtags: generatedContent.hashtags,
        },
        platform
      );

      const row = {
        platform,
        content_type: contentType,
        title: generatedContent.title,
        description: generatedContent.body,
        caption: caption_final,
        hashtags: generatedContent.hashtags,
        cta: generatedContent.cta,

        preview_url: generatedContent.preview_url ?? null,
        asset_url: generatedContent.asset_url ?? null,
        asset_type: generatedContent.asset_type ?? null,

        // 🔥 carrusel_urls opcional: si tu tabla tiene jsonb, genial; si no, lo omitimos
        // carousel_urls: Array.isArray(generatedContent.carousel_urls) ? generatedContent.carousel_urls : [],

        scheduled_date: scheduleData.date,
        scheduled_time: scheduleData.time,
        product_id: selectedProduct || null,

        generated_content_id: generatedContent.id ?? null,

        status: 'scheduled',
        campaign_type: campaignType,
        ab_variant: campaignType === 'paid' ? abVariant : null,
        target_age_range: campaignType === 'paid' ? ageRange : null,
        target_interests: campaignType === 'paid' ? interests : null,
      };

      const { error } = await supabase
        .from('content_calendar')
        .insert([row]);

      if (error) throw error;

      setShowScheduleModal(false);
      window.dispatchEvent(new CustomEvent('calendar:refresh'));
      alert('✅ Contenido programado exitosamente en el calendario');
    } catch (error) {
      console.error('Error scheduling content:', error);
      alert('❌ Error al programar contenido');
    }
  };

  // Fallback local
  const generateContentByStrategy = (data, product) => {
    const productName = product?.name || 'Producto Keloke';
    const price = product?.price ?? '29.990';
    const currency = product?.currency || 'CLP';

    let title = '';
    let body = '';
    let caption = '';
    let cta = '';
    let hashtags = [];

    const priceLabel = formatPrice(price, currency);

    switch (data.strategy) {
      case 'aida':
        title = `🔥 ¡Descubre ${productName}!`;
        body =
          `ATENCIÓN: ¿Buscas una solución práctica para tu día a día?\n\n` +
          `INTERÉS: ${productName} te ayuda con un beneficio clave sin complicarte.\n\n` +
          `DESEO: Imagina mejorar resultados en minutos, con menos esfuerzo.\n\n` +
          `ACCIÓN: Llévalo hoy por $${priceLabel}.\n🚚 Envío a todo Chile.`;
        caption = `¡${productName} puede ser tu mejor compra! 🚀`;
        cta = '¡Compra ahora con envío a todo Chile!';
        hashtags = ['#Keloke', '#Chile', '#Ofertas', '#ComprasOnline'];
        break;

      case 'pas':
        title = `😰 ¿Te pasa esto? ${productName} lo soluciona`;
        body =
          `PROBLEMA: Ese problema típico te quita tiempo.\n\n` +
          `AGITACIÓN: Terminas gastando más de lo necesario.\n\n` +
          `SOLUCIÓN: ${productName} te lo deja resuelto en minutos.\n\n` +
          `💰 $${priceLabel}\n🚚 Envío a todo Chile`;
        caption = `La solución real: ${productName} ✅`;
        cta = '¡Pídelo ahora!';
        hashtags = ['#Keloke', '#Chile', '#Solución', '#Ofertas'];
        break;

      case 'storytelling':
        title = `📖 La historia de alguien que probó ${productName}`;
        body =
          `“Antes me costaba resolver esto. Probé ${productName} y cambió todo.”\n\n` +
          `✨ ${productName}\n💰 $${priceLabel}\n🚚 Envío a todo Chile`;
        caption = `Tu historia puede ser la próxima 🌟`;
        cta = '¡Compra hoy!';
        hashtags = ['#Keloke', '#Testimonio', '#Chile', '#Transformación'];
        break;

      case 'gatillo':
        title = `⏰ Últimas unidades de ${productName}`;
        body =
          `🚨 STOCK LIMITADO 🚨\n\n` +
          `Quedan pocas unidades a $${priceLabel}.\n` +
          `✅ Envío a todo Chile\n✅ Compra segura`;
        caption = `No lo dejes pasar ⚡`;
        cta = '¡Comprar ahora!';
        hashtags = ['#OfertaLimitada', '#Keloke', '#Chile', '#Urgente'];
        break;

      default:
        title = `✨ ${productName}`;
        body = `Descubre ${productName}.\n💰 $${priceLabel}\n🚚 Envío a todo Chile`;
        caption = `¡Conoce ${productName}! 🎉`;
        cta = '¡Compra ahora!';
        hashtags = ['#Keloke', '#Chile', '#Productos'];
    }

    if (data.platform === 'whatsapp') {
      body = body.replace(/\n\n/g, '\n').substring(0, 650);
      caption = `*${caption}*`;
    }

    if (data.campaign_type === 'paid') {
      cta = `${cta} - Variante ${data.ab_variant}`;
      body = `🎯 Audiencia: ${data.age_range} años | Intereses: ${data.interests}\n\n${body}`;
    }

    return {
      title,
      body,
      caption,
      cta,
      hashtags: hashtags.join(' '),
      preview_url: data.preview_url || product?.image_url || safePlaceholder(data.content_type),
      asset_url: null,
      asset_type: null,
      carousel_urls: Array.isArray(data.carousel_urls) ? data.carousel_urls : [],
    };
  };

  const compiledTextForCopy = useMemo(() => {
    if (!generatedContent) return '';
    return `${generatedContent.title}\n\n${generatedContent.body}\n\n${generatedContent.caption}\n\n${generatedContent.hashtags}\n\n${generatedContent.cta}`;
  }, [generatedContent]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            Generador de Contenido Automático
          </h1>
          <p className="text-gray-600 mt-1">
            Crea contenido optimizado con IA para redes sociales y campañas pagadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6" style={{ color: '#D4A017' }} />
          <span className="text-sm font-medium" style={{ color: '#2D5016' }}>
            IA Activa
          </span>
        </div>
      </div>

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
            <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: '#2D5016' }}>
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
                style={campaignType === 'organic' ? { borderColor: '#2D5016', backgroundColor: '#F5E6D3' } : {}}
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
                style={campaignType === 'paid' ? { borderColor: '#2D5016', backgroundColor: '#F5E6D3' } : {}}
              >
                <p className="font-medium text-sm">💰 Campañas Pagadas</p>
                <p className="text-xs text-gray-500 mt-1">Meta Ads, TikTok Ads</p>
              </button>
            </div>
          </div>

          {/* Platform */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3" style={{ color: '#2D5016' }}>Plataforma</h3>
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
                  style={platform === p.id ? { borderColor: '#2D5016', backgroundColor: '#F5E6D3' } : {}}
                >
                  <p className="font-medium text-xs">{p.emoji} {p.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Content type */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3" style={{ color: '#2D5016' }}>Formato</h3>
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
                    style={contentType === type.id ? { borderColor: '#2D5016', backgroundColor: '#F5E6D3' } : {}}
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
              <h3 className="font-bold flex items-center gap-2" style={{ color: '#2D5016' }}>
                <Wand2 className="w-5 h-5" />
                Configuración de Contenido
              </h3>
              <Sparkles className="w-5 h-5" style={{ color: '#D4A017' }} />
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
                  <h4 className="font-medium text-sm mb-3" style={{ color: '#2D5016' }}>
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
                            style={abVariant === variant ? { borderColor: '#2D5016', backgroundColor: '#F5E6D3' } : {}}
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
                style={{ backgroundColor: '#2D5016' }}
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
          {generatedContent && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2" style={{ color: '#2D5016' }}>
                  <Eye className="w-5 h-5" />
                  Vista Previa del Contenido
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(compiledTextForCopy)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Copiar contenido"
                  >
                    <Copy className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>

                  <button
                    onClick={downloadText}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Descargar texto"
                  >
                    <Download className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>

                  <button
                    onClick={downloadAsset}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Descargar imagen/video (si existe)"
                  >
                    <ImageIcon className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>

                  <button
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Compartir (placeholder UI)"
                    onClick={() => {
                      setStatusMsg({ type: 'info', text: 'Compartir queda como placeholder (se implementa si lo necesitas).' });
                      clearStatusSoon(3000);
                    }}
                  >
                    <Share2 className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center border-2 border-gray-200 overflow-hidden">
                    <img
                      src={generatedContent.preview_url || safePlaceholder(contentType)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = safePlaceholder(contentType); }}
                    />
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
                        <span className="font-medium" style={{ color: '#D4A017' }}>
                          Variante {abVariant}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">TÍTULO</label>
                    <p className="font-bold text-lg" style={{ color: '#2D5016' }}>
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
                    <p className="text-sm font-medium whitespace-pre-line" style={{ color: '#2D5016' }}>
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
                      style={{ backgroundColor: '#2D5016' }}
                    >
                      {generatedContent.cta}
                    </div>
                  </div>

                  {campaignType === 'paid' && (
                    <div className="border-t pt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-2">SEGMENTACIÓN</label>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" style={{ color: '#2D5016' }} />
                          <span>{ageRange} años</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="w-4 h-4" style={{ color: '#2D5016' }} />
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
                  style={{ backgroundColor: '#2D5016' }}
                >
                  📅 Programar Publicación
                </button>

                <button
                  onClick={publishContent}
                  disabled={publishLoading}
                  className="flex-1 min-w-[160px] py-3 rounded-lg font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#D4A017' }}
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
                <Sparkles className="w-16 h-16 mx-auto mb-4" style={{ color: '#D4A017' }} />
                <h3 className="font-bold text-xl mb-2" style={{ color: '#2D5016' }}>
                  Genera tu primer contenido
                </h3>
                <p className="text-gray-600 mb-6">
                  Configura los parámetros y presiona "Generar Contenido Automático" para crear contenido optimizado con IA
                </p>
                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
                      <TrendingUp className="w-6 h-6" style={{ color: '#2D5016' }} />
                    </div>
                    <p className="text-xs text-gray-600">Optimizado para engagement</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
                      <Target className="w-6 h-6" style={{ color: '#2D5016' }} />
                    </div>
                    <p className="text-xs text-gray-600">Segmentación precisa</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
                      <Zap className="w-6 h-6" style={{ color: '#2D5016' }} />
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
            <h2 className="text-2xl font-bold" style={{ color: '#2D5016' }}>
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
              <TrendingUp className="w-4 h-4" style={{ color: '#2D5016' }} />
              <p className="font-medium text-sm" style={{ color: '#2D5016' }}>
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
                  style={scheduleTime === time ? { backgroundColor: '#2D5016' } : {}}
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
              style={{ backgroundColor: '#2D5016' }}
            >
              Programar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

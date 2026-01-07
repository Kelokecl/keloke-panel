import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  FileText, Image, Video, Sparkles,
  Download, Copy, Share2, Eye, Wand2, RefreshCw,
  TrendingUp, Target, Users, Zap
} from 'lucide-react';

/**
 * ContentGenerator.jsx (FULL)
 * - UI se mantiene.
 * - Generación: llama a Supabase Edge Function "generate-content".
 * - Persistencia: guarda en generated_content.
 * - Publicación: llama a Edge Function "publish-content".
 * - Productos: sincroniza Shopify -> tabla products y lista actualizada.
 *
 * FIXES:
 * - Placeholder preview: via.placeholder.com -> placehold.co
 * - products.order: updated_at -> created_at (tu tabla products no tiene updated_at)
 * - img fallback para que nunca quede blanco
 */

export default function ContentGenerator() {
  const [loading, setLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  const [products, setProducts] = useState([]);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Estados del formulario
  const [campaignType, setCampaignType] = useState('organic');
  const [platform, setPlatform] = useState('instagram');
  const [contentType, setContentType] = useState('post');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [strategy, setStrategy] = useState('aida');
  const [abVariant, setAbVariant] = useState('A');
  const [ageRange, setAgeRange] = useState('25-45');
  const [interests, setInterests] = useState('');
  const [tone, setTone] = useState('profesional');

  // Para reintentos/regeneración
  const [lastRequest, setLastRequest] = useState(null);

  // Mensajes UI
  const [statusMsg, setStatusMsg] = useState(null); // {type:'ok'|'err'|'info', text:''}

  useEffect(() => {
    loadProducts();
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
      // Formato CL
      const formatted = new Intl.NumberFormat('es-CL').format(n);
      // Si no es CLP, mostramos el código
      return currency ? `${formatted} ${currency}` : formatted;
    } catch {
      return `${n} ${currency || ''}`.trim();
    }
  };

  const loadProducts = async () => {
    try {
      // 1) (Opcional) disparar sync para mantener actualizado
      await supabase.functions.invoke('sync-shopify-products', { body: { limit: 100 } });

      // 2) Leer desde la tabla products (tu tabla tiene created_at, NO updated_at)
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, currency, image_url, shopify_product_id')
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
      clearStatusSoon(4000);
    }
  };

  const buildPayload = (product) => {
    return {
      campaign_type: campaignType,
      platform,
      content_type: contentType,
      product_id: product?.id ?? null,
      product_name: product?.name || 'Producto Keloke',
      product_price: product?.price || null,
      product_currency: product?.currency || 'CLP',
      product_image_url: product?.image_url || null,
      strategy,
      tone,
      ab_variant: campaignType === 'paid' ? abVariant : null,
      age_range: campaignType === 'paid' ? ageRange : null,
      interests: campaignType === 'paid' ? interests : null,
      generated_at: new Date().toISOString(),
    };
  };

  const normalizeGenerated = (raw, payload, product) => {
    // Esperado:
    // { title, body, caption, hashtags, cta, preview_url, asset_url?, asset_type? }
    const fallback = generateContentByStrategy(payload, product);

    if (!raw || typeof raw !== 'object') return fallback;

    return {
      title: raw.title ?? fallback.title,
      body: raw.body ?? fallback.body,
      caption: raw.caption ?? fallback.caption,
      hashtags: raw.hashtags ?? fallback.hashtags,
      cta: raw.cta ?? fallback.cta,
      preview_url: raw.preview_url ?? fallback.preview_url,
      asset_url: raw.asset_url ?? null,        // opcional (video/imagen real)
      asset_type: raw.asset_type ?? null,      // 'image'|'video'|'text' opcional
      provider: raw.provider ?? 'supabase',
      model: raw.model ?? null,
    };
  };

  const generateViaEdgeFunction = async (payload) => {
    const { data, error } = await supabase.functions.invoke('generate-content', { body: payload });
    if (error) throw error;
    return data;
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

      // opcionales (si tu tabla los tiene)
      asset_url: content.asset_url ?? null,
      asset_type: content.asset_type ?? null,
    };

    // Intento 1: con campos opcionales
    try {
      const { data: saved, error } = await supabase
        .from('generated_content')
        .insert([insertRow])
        .select()
        .single();

      if (error) throw error;
      return saved;
    } catch (e) {
      // Si tu tabla no tiene asset_url/asset_type, reintenta sin esos campos
      console.warn('saveGeneratedToSupabase fallback:', e);

      const { asset_url, asset_type, ...safeRow } = insertRow;

      const { data: saved2, error: err2 } = await supabase
        .from('generated_content')
        .insert([safeRow])
        .select()
        .single();

      if (err2) throw err2;
      return saved2;
    }
  };

  const generateContent = async () => {
    if (!selectedProduct && products.length > 0) {
      setStatusMsg({ type: 'err', text: 'Selecciona un producto.' });
      clearStatusSoon();
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      const product = products.find(p => String(p.id) === String(selectedProduct)) || products[0] || null;
      const payload = buildPayload(product);
      setLastRequest({ payload, product });

      // 1) Intento Edge Function (real)
      let raw = null;
      try {
        raw = await generateViaEdgeFunction(payload);
      } catch (edgeErr) {
        console.error('Edge function generate-content failed:', edgeErr);
        raw = null;
        setStatusMsg({
          type: 'info',
          text: 'La función generate-content no respondió. Usé el generador local como respaldo.'
        });
        clearStatusSoon(3500);
      }

      const content = normalizeGenerated(raw, payload, product);

      // 3) Guardar en Supabase
      const savedContent = await saveGeneratedToSupabase(payload, product, content);

      // 4) Estado UI
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
      setLoading(false);
    }
  };

  const regenerateContent = async () => {
    if (!lastRequest) {
      await generateContent();
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      const { payload, product } = lastRequest;

      let raw = null;
      try {
        raw = await generateViaEdgeFunction({ ...payload, regenerate: true });
      } catch (edgeErr) {
        console.error('Edge function regenerate failed:', edgeErr);
        raw = null;
        setStatusMsg({
          type: 'info',
          text: 'No respondió generate-content (regenerate). Usé respaldo local.'
        });
        clearStatusSoon(3500);
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
      setLoading(false);
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

  const publishContent = async () => {
    if (!generatedContent) return;

    // Placeholder TikTok
    if (platform === 'tiktok') {
      setStatusMsg({ type: 'info', text: 'TikTok queda en placeholder por ahora (no publica).' });
      clearStatusSoon(3500);
      return;
    }

    setPublishLoading(true);
    setStatusMsg(null);

    try {
      const payload = {
        platform,
        content_type: contentType,
        campaign_type: campaignType,
        generated_content_id: generatedContent.id ?? null,
        content: {
          title: generatedContent.title,
          body: generatedContent.body,
          caption: generatedContent.caption,
          hashtags: generatedContent.hashtags,
          cta: generatedContent.cta,
          preview_url: generatedContent.preview_url ?? null,
          asset_url: generatedContent.asset_url ?? null,
          asset_type: generatedContent.asset_type ?? null,
        },
        targeting: campaignType === 'paid'
          ? { ab_variant: abVariant, age_range: ageRange, interests }
          : null,
      };

      const { data, error } = await supabase.functions.invoke('publish-content', { body: payload });
      if (error) throw error;

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
      setStatusMsg({ type: 'err', text: '❌ Error al publicar (backend publish-content).' });
      clearStatusSoon(3500);
      alert('❌ Error al publicar. Revisa logs de Supabase Edge Function publish-content.');
    } finally {
      setPublishLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    try {
      navigator.clipboard.writeText(text);
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

      const { error } = await supabase
        .from('content_calendar')
        .insert([{
          platform,
          content_type: contentType,
          title: generatedContent.title,
          description: generatedContent.body,
          caption: generatedContent.caption,
          hashtags: generatedContent.hashtags,
          cta: generatedContent.cta,
          scheduled_date: scheduleData.date,
          scheduled_time: scheduleData.time,
          product_id: selectedProduct || null,
          status: 'scheduled',
          campaign_type: campaignType,
          ab_variant: campaignType === 'paid' ? abVariant : null,
          target_age_range: campaignType === 'paid' ? ageRange : null,
          target_interests: campaignType === 'paid' ? interests : null
        }]);

      if (error) throw error;

      setShowScheduleModal(false);
      alert('✅ Contenido programado exitosamente en el calendario');
    } catch (error) {
      console.error('Error scheduling content:', error);
      alert('❌ Error al programar contenido');
    }
  };

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
        title = `🔥 ¡Descubre el ${productName}!`;
        body =
          `¿Cansado de [problema]? 🤔\n\n` +
          `El ${productName} es la solución que estabas buscando. ✨\n\n` +
          `Imagina poder [beneficio principal] sin complicaciones. Con nuestro producto, podrás:\n\n` +
          `✅ [Beneficio 1]\n✅ [Beneficio 2]\n✅ [Beneficio 3]\n\n` +
          `💰 Solo $${priceLabel}\n🚚 Envío gratis a todo Chile`;
        caption = `¡Transforma tu vida con ${productName}! 🚀`;
        cta = '¡Compra ahora con envío gratis!';
        hashtags = ['#Keloke', '#Chile', '#Innovacion', '#Tecnologia', '#Ofertas'];
        break;

      case 'pas':
        title = `😰 ¿Sufres de [problema]?`;
        body =
          `Sabemos lo frustrante que es [problema específico]. Cada día pierdes tiempo y dinero sin una solución real.\n\n` +
          `❌ Ya probaste todo y nada funciona\n❌ Gastas más de lo necesario\n❌ Te sientes estancado\n\n` +
          `✅ PERO HAY UNA SOLUCIÓN:\n\n` +
          `${productName} cambia las reglas del juego. Con tecnología de punta y diseño inteligente, resuelve tu problema de raíz.\n\n` +
          `💎 Solo $${priceLabel}\n🎁 Oferta limitada`;
        caption = `La solución que necesitabas está aquí 💪`;
        cta = '¡Soluciona tu problema HOY!';
        hashtags = ['#Solucion', '#Keloke', '#Chile', '#Calidad', '#Innovacion'];
        break;

      case 'storytelling':
        title = `📖 La historia de María y su ${productName}`;
        body =
          `María estaba cansada de [problema]. Un día descubrió ${productName} y su vida cambió por completo.\n\n` +
          `"Antes perdía horas en [tarea]. Ahora lo hago en minutos y con mejores resultados" - María, Santiago.\n\n` +
          `¿Quieres vivir la misma transformación?\n\n` +
          `🌟 ${productName}\n💰 $${priceLabel}\n🚚 Envío express disponible`;
        caption = `Tu historia de éxito comienza aquí 🌟`;
        cta = '¡Únete a miles de clientes felices!';
        hashtags = ['#Testimonios', '#Keloke', '#Exito', '#Chile', '#Transformacion'];
        break;

      case 'gatillo':
        title = `⏰ ÚLTIMA OPORTUNIDAD - ${productName}`;
        body =
          `🚨 ALERTA DE STOCK LIMITADO 🚨\n\n` +
          `Quedan solo 12 unidades del ${productName} a este precio especial.\n\n` +
          `✅ HOY solo $${priceLabel}\n\n` +
          `⚡ Los primeros 10 compradores reciben:\n` +
          `🎁 Envío gratis\n🎁 Garantía extendida\n🎁 Soporte prioritario\n\n` +
          `⏰ Oferta válida por 6 horas`;
        caption = `¡No dejes pasar esta oportunidad! ⚡`;
        cta = '¡COMPRAR AHORA antes que se agote!';
        hashtags = ['#OfertaLimitada', '#Urgente', '#Keloke', '#Chile', '#Descuento'];
        break;

      default:
        title = `✨ ${productName} - Lo mejor para ti`;
        body = `Descubre ${productName}, el producto que revolucionará tu día a día.\n\n💰 Precio especial: $${priceLabel}\n🚚 Envío a todo Chile`;
        caption = `¡Conoce nuestro ${productName}! 🎉`;
        cta = '¡Compra ahora!';
        hashtags = ['#Keloke', '#Chile', '#Productos'];
    }

    if (data.platform === 'tiktok') {
      caption = caption + ' #TikTokMadeMeBuyIt #ChileTikTok';
      hashtags.push('TikTokChile', 'Viral', 'FYP');
    } else if (data.platform === 'whatsapp') {
      body = body.replace(/\n\n/g, '\n').substring(0, 500);
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

      // Si el producto tiene image_url úsala de preview, si no usa placeholder
      preview_url: product?.image_url || generatePreviewUrl(data.content_type),

      asset_url: null,
      asset_type: null
    };
  };

  // FIX: placeholder robusto (placehold.co) — NO via.placeholder.com
  const generatePreviewUrl = (type) => {
    const base = 'https://placehold.co';
    const mockPreviews = {
      post: `${base}/1080x1080/png?text=Post+Preview`,
      reel: `${base}/1080x1920/png?text=Reel+Preview`,
      story: `${base}/1080x1920/png?text=Story+Preview`,
      carousel: `${base}/1080x1080/png?text=Carousel+Preview`
    };
    return mockPreviews[type] || mockPreviews.post;
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
        {/* Panel de Configuración */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tipo de Campaña */}
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

          {/* Plataforma */}
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

          {/* Tipo de Contenido */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3" style={{ color: '#2D5016' }}>Formato</h3>
            <div className="space-y-2">
              {[
                { id: 'post', name: 'Post', icon: FileText },
                { id: 'reel', name: 'Reel/Video', icon: Video },
                { id: 'story', name: 'Historia', icon: Image },
                { id: 'carousel', name: 'Carrusel', icon: Image }
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

        {/* Panel de Generación */}
        <div className="lg:col-span-2 space-y-4">
          {/* Formulario */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2" style={{ color: '#2D5016' }}>
                <Wand2 className="w-5 h-5" />
                Configuración de Contenido
              </h3>
              <Sparkles className="w-5 h-5" style={{ color: '#D4A017' }} />
            </div>

            <div className="space-y-4">
              {/* Producto */}
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

              {/* Estrategia */}
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

              {/* Tono */}
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

              {/* Opciones pagadas */}
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

              {/* Generar */}
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
                    <Image className="w-4 h-4" style={{ color: '#2D5016' }} />
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
                      src={generatedContent.preview_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'https://placehold.co/1080x1080/png?text=Preview';
                      }}
                    />
                  </div>

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
                    <label className="block text-xs font-medium text-gray-500 mb-1">CAPTION</label>
                    <p className="text-sm font-medium" style={{ color: '#2D5016' }}>
                      {generatedContent.caption}
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

              {/* Acciones */}
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
                  TikTok está en placeholder por ahora (se activa al final cuando esté aprobado).
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
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
            >
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

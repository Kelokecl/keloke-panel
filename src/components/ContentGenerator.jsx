import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileText, Image, Video, MessageSquare, Sparkles, 
  Download, Copy, Share2, Eye, Wand2, RefreshCw,
  TrendingUp, Target, Users, Zap
} from 'lucide-react';

export default function ContentGenerator() {
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) setProducts(data);
  };

  const generateContent = async () => {
    setLoading(true);
    
    try {
      // Simulación de generación con IA (aquí integrarías OpenAI/Claude)
      const product = products.find(p => p.id === selectedProduct) || products[0];
      
      const contentData = {
        campaign_type: campaignType,
        platform: platform,
        content_type: contentType,
        product_id: product?.id,
        product_name: product?.name || 'Producto Keloke',
        strategy: strategy,
        ab_variant: campaignType === 'paid' ? abVariant : null,
        age_range: campaignType === 'paid' ? ageRange : null,
        interests: campaignType === 'paid' ? interests : null,
        tone: tone,
        generated_at: new Date().toISOString()
      };

      // Generar contenido basado en estrategia
      const content = generateContentByStrategy(contentData, product);
      
      // Guardar en Supabase
      const { data: savedContent, error } = await supabase
        .from('generated_content')
        .insert([{
          campaign_type: campaignType,
          platform: platform,
          content_type: contentType,
          product_id: product?.id,
          title: content.title,
          body: content.body,
          caption: content.caption,
          hashtags: content.hashtags,
          cta: content.cta,
          strategy: strategy,
          ab_variant: campaignType === 'paid' ? abVariant : null,
          target_age_range: campaignType === 'paid' ? ageRange : null,
          target_interests: campaignType === 'paid' ? interests : null,
          tone: tone,
          preview_url: content.preview_url,
          status: 'draft'
        }])
        .select()
        .single();

      if (savedContent) {
        setGeneratedContent({ ...content, id: savedContent.id });
      }
      
    } catch (error) {
      console.error('Error generando contenido:', error);
      alert('Error al generar contenido. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const generateContentByStrategy = (data, product) => {
    const productName = product?.name || 'Producto Keloke';
    const price = product?.price || '29.990';
    
    let title = '';
    let body = '';
    let caption = '';
    let cta = '';
    let hashtags = [];

    // Estrategias de contenido
    switch (data.strategy) {
      case 'aida':
        // Atención, Interés, Deseo, Acción
        title = `🔥 ¡Descubre el ${productName}!`;
        body = `¿Cansado de [problema]? 🤔\n\nEl ${productName} es la solución que estabas buscando. ✨\n\nImagina poder [beneficio principal] sin complicaciones. Con nuestro producto, podrás:\n\n✅ [Beneficio 1]\n✅ [Beneficio 2]\n✅ [Beneficio 3]\n\n💰 Solo $${price} CLP\n🚚 Envío gratis a todo Chile`;
        caption = `¡Transforma tu vida con ${productName}! 🚀`;
        cta = '¡Compra ahora con envío gratis!';
        hashtags = ['#Keloke', '#Chile', '#Innovacion', '#Tecnologia', '#Ofertas'];
        break;

      case 'pas':
        // Problema, Agitación, Solución
        title = `😰 ¿Sufres de [problema]?`;
        body = `Sabemos lo frustrante que es [problema específico]. Cada día pierdes tiempo y dinero sin una solución real.\n\n❌ Ya probaste todo y nada funciona\n❌ Gastas más de lo necesario\n❌ Te sientes estancado\n\n✅ PERO HAY UNA SOLUCIÓN:\n\n${productName} cambia las reglas del juego. Con tecnología de punta y diseño inteligente, resuelve tu problema de raíz.\n\n💎 Solo $${price} CLP\n🎁 Oferta limitada`;
        caption = `La solución que necesitabas está aquí 💪`;
        cta = '¡Soluciona tu problema HOY!';
        hashtags = ['#Solucion', '#Keloke', '#Chile', '#Calidad', '#Innovacion'];
        break;

      case 'storytelling':
        title = `📖 La historia de María y su ${productName}`;
        body = `María estaba cansada de [problema]. Un día descubrió ${productName} y su vida cambió por completo.\n\n"Antes perdía horas en [tarea]. Ahora lo hago en minutos y con mejores resultados" - María, Santiago.\n\n¿Quieres vivir la misma transformación?\n\n🌟 ${productName}\n💰 $${price} CLP\n🚚 Envío express disponible`;
        caption = `Tu historia de éxito comienza aquí 🌟`;
        cta = '¡Únete a miles de clientes felices!';
        hashtags = ['#Testimonios', '#Keloke', '#Exito', '#Chile', '#Transformacion'];
        break;

      case 'gatillo':
        title = `⏰ ÚLTIMA OPORTUNIDAD - ${productName}`;
        body = `🚨 ALERTA DE STOCK LIMITADO 🚨\n\nQuedan solo 12 unidades del ${productName} a este precio especial.\n\n❌ Mañana vuelve a su precio normal de $${parseInt(price.replace(/\./g, '')) + 10000}\n✅ HOY solo $${price} CLP\n\n⚡ Los primeros 10 compradores reciben:\n🎁 Envío gratis\n🎁 Garantía extendida\n🎁 Soporte prioritario\n\n⏰ Oferta válida por 6 horas`;
        caption = `¡No dejes pasar esta oportunidad! ⚡`;
        cta = '¡COMPRAR AHORA antes que se agote!';
        hashtags = ['#OfertaLimitada', '#Urgente', '#Keloke', '#Chile', '#Descuento'];
        break;

      default:
        title = `✨ ${productName} - Lo mejor para ti`;
        body = `Descubre ${productName}, el producto que revolucionará tu día a día.\n\n💰 Precio especial: $${price} CLP\n🚚 Envío a todo Chile`;
        caption = `¡Conoce nuestro ${productName}! 🎉`;
        cta = '¡Compra ahora!';
        hashtags = ['#Keloke', '#Chile', '#Productos'];
    }

    // Ajustar según plataforma
    if (data.platform === 'tiktok') {
      caption = caption + ' #TikTokMadeMeBuyIt #ChileTikTok';
      hashtags.push('TikTokChile', 'Viral', 'FYP');
    } else if (data.platform === 'whatsapp') {
      body = body.replace(/\n\n/g, '\n').substring(0, 500);
      caption = `*${caption}*`;
    }

    // Ajustar según tipo de campaña
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
      preview_url: generatePreviewUrl(data.content_type, data.platform)
    };
  };

  const generatePreviewUrl = (contentType, platform) => {
    // Aquí generarías URLs reales de previews con IA de imágenes/videos
    const mockPreviews = {
      post: 'https://via.placeholder.com/1080x1080/2D5016/FFFFFF?text=Post+Preview',
      reel: 'https://via.placeholder.com/1080x1920/2D5016/FFFFFF?text=Reel+Preview',
      story: 'https://via.placeholder.com/1080x1920/2D5016/FFFFFF?text=Story+Preview',
      carousel: 'https://via.placeholder.com/1080x1080/2D5016/FFFFFF?text=Carousel+Preview'
    };
    return mockPreviews[contentType] || mockPreviews.post;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('¡Contenido copiado al portapapeles!');
  };

  const downloadContent = () => {
    if (!generatedContent) return;
    
    const content = `${generatedContent.title}\n\n${generatedContent.body}\n\n${generatedContent.caption}\n\n${generatedContent.hashtags}\n\n${generatedContent.cta}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contenido-${platform}-${Date.now()}.txt`;
    a.click();
  };

  const scheduleContent = async (scheduleData) => {
    try {
      const { data, error } = await supabase
        .from('content_calendar')
        .insert([{
          platform: platform,
          content_type: contentType,
          title: generatedContent.title,
          description: generatedContent.body,
          caption: generatedContent.caption,
          hashtags: generatedContent.hashtags,
          cta: generatedContent.cta,
          scheduled_date: scheduleData.date,
          scheduled_time: scheduleData.time,
          product_id: selectedProduct,
          status: 'scheduled',
          campaign_type: campaignType,
          ab_variant: campaignType === 'paid' ? abVariant : null,
          target_age_range: campaignType === 'paid' ? ageRange : null,
          target_interests: campaignType === 'paid' ? interests : null
        }])
        .select();

      if (error) throw error;
      
      setShowScheduleModal(false);
      alert('✅ Contenido programado exitosamente en el calendario');
    } catch (error) {
      console.error('Error scheduling content:', error);
      alert('❌ Error al programar contenido');
    }
  };

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
              {[
                { id: 'instagram', name: 'Instagram', emoji: '📸' },
                { id: 'tiktok', name: 'TikTok', emoji: '🎵' },
                { id: 'facebook', name: 'Facebook', emoji: '👥' },
                { id: 'youtube', name: 'YouTube', emoji: '▶️' },
                { id: 'whatsapp', name: 'WhatsApp', emoji: '💬' }
              ].map((p) => (
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
          {/* Formulario de Generación */}
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
                  style={{ focusRingColor: '#2D5016' }}
                >
                  <option value="">Selecciona un producto</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} - ${product.price}
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

              {/* Opciones para Campañas Pagadas */}
              {campaignType === 'paid' && (
                <>
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-sm mb-3" style={{ color: '#2D5016' }}>
                      🎯 Configuración de Campaña Pagada
                    </h4>
                    
                    <div className="space-y-3">
                      {/* Variante A/B */}
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

                      {/* Segmentación */}
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
                </>
              )}

              {/* Botón Generar */}
              <button
                onClick={generateContent}
                disabled={loading || !selectedProduct}
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

          {/* Vista Previa del Contenido Generado */}
          {generatedContent && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2" style={{ color: '#2D5016' }}>
                  <Eye className="w-5 h-5" />
                  Vista Previa del Contenido
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(`${generatedContent.title}\n\n${generatedContent.body}\n\n${generatedContent.caption}\n\n${generatedContent.hashtags}\n\n${generatedContent.cta}`)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Copiar contenido"
                  >
                    <Copy className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>
                  <button
                    onClick={downloadContent}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Descargar contenido"
                  >
                    <Download className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    title="Compartir"
                  >
                    <Share2 className="w-4 h-4" style={{ color: '#2D5016' }} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Preview Visual */}
                <div>
                  <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center border-2 border-gray-200 overflow-hidden">
                    <img 
                      src={generatedContent.preview_url} 
                      alt="Preview"
                      className="w-full h-full object-cover"
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

                {/* Contenido de Texto */}
                <div className="space-y-4">
                  {/* Título */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">TÍTULO</label>
                    <p className="font-bold text-lg" style={{ color: '#2D5016' }}>
                      {generatedContent.title}
                    </p>
                  </div>

                  {/* Cuerpo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">DESCRIPCIÓN</label>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {generatedContent.body}
                    </p>
                  </div>

                  {/* Caption */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">CAPTION</label>
                    <p className="text-sm font-medium" style={{ color: '#2D5016' }}>
                      {generatedContent.caption}
                    </p>
                  </div>

                  {/* Hashtags */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">HASHTAGS</label>
                    <p className="text-sm text-blue-600">
                      {generatedContent.hashtags}
                    </p>
                  </div>

                  {/* CTA */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">LLAMADO A LA ACCIÓN</label>
                    <div 
                      className="inline-block px-4 py-2 rounded-lg text-white font-medium text-sm"
                      style={{ backgroundColor: '#2D5016' }}
                    >
                      {generatedContent.cta}
                    </div>
                  </div>

                  {/* Segmentación (si es campaña pagada) */}
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
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="flex-1 py-3 rounded-lg font-medium text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: '#2D5016' }}
                >
                  📅 Programar Publicación
                </button>
                <button
                  className="flex-1 py-3 rounded-lg font-medium border-2 transition-all hover:bg-gray-50"
                  style={{ borderColor: '#2D5016', color: '#2D5016' }}
                >
                  💾 Guardar como Borrador
                </button>
                <button
                  onClick={generateContent}
                  className="px-6 py-3 rounded-lg font-medium border-2 border-gray-300 text-gray-700 transition-all hover:bg-gray-50"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Placeholder si no hay contenido */}
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
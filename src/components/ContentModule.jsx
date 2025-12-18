import React, { useState } from 'react';
import { FileText, Image, Video, MessageSquare, Sparkles } from 'lucide-react';

export default function ContentModule() {
  const [contentType, setContentType] = useState('post');
  const [platform, setPlatform] = useState('instagram');
  const [campaignType, setCampaignType] = useState('organic');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Generador de Contenido</h1>
        <p className="text-gray-600 mt-1">Crea contenido automático para redes sociales y campañas pagadas</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuración */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-4" style={{ color: '#2D5016' }}>Tipo de Campaña</h3>
            <div className="space-y-2">
              <button
                onClick={() => setCampaignType('organic')}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  campaignType === 'organic'
                    ? 'border-opacity-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={campaignType === 'organic' ? { borderColor: '#2D5016' } : {}}
              >
                <p className="font-medium text-sm">Contenido Orgánico</p>
                <p className="text-xs text-gray-500 mt-1">Posts, reels, historias</p>
              </button>
              <button
                onClick={() => setCampaignType('paid')}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  campaignType === 'paid'
                    ? 'border-opacity-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={campaignType === 'paid' ? { borderColor: '#2D5016' } : {}}
              >
                <p className="font-medium text-sm">Campañas Pagadas</p>
                <p className="text-xs text-gray-500 mt-1">Meta Ads, TikTok Ads</p>
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-4" style={{ color: '#2D5016' }}>Plataforma</h3>
            <div className="grid grid-cols-2 gap-2">
              {['instagram', 'tiktok', 'facebook', 'youtube', 'whatsapp'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`p-3 rounded-lg border-2 transition-all capitalize ${
                    platform === p
                      ? 'border-opacity-100'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={platform === p ? { borderColor: '#2D5016' } : {}}
                >
                  <p className="font-medium text-xs">{p}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-4" style={{ color: '#2D5016' }}>Tipo de Contenido</h3>
            <div className="space-y-2">
              {[
                { id: 'post', name: 'Post', icon: FileText },
                { id: 'reel', name: 'Reel/Video', icon: Video },
                { id: 'story', name: 'Historia', icon: Image },
                { id: 'carousel', name: 'Carrusel', icon: Image },
              ].map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setContentType(type.id)}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left flex items-center gap-3 ${
                      contentType === type.id
                        ? 'border-opacity-100'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={contentType === type.id ? { borderColor: '#2D5016' } : {}}
                  >
                    <Icon className="w-4 h-4" />
                    <p className="font-medium text-sm">{type.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Vista Previa y Generación */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: '#2D5016' }}>Generar Contenido con IA</h3>
              <Sparkles className="w-5 h-5" style={{ color: '#D4A017' }} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Producto o Tema
                </label>
                <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none">
                  <option>Freidora de Aire 5L + Moldes</option>
                  <option>Impresora Térmica + 20 Rollos</option>
                  <option>Pelota Inteligente para Mascotas</option>
                  <option>Masajeador Infrarrojo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estrategia de Contenido
                </label>
                <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none">
                  <option>AIDA (Atención, Interés, Deseo, Acción)</option>
                  <option>PAS (Problema, Agitación, Solución)</option>
                  <option>Storytelling</option>
                  <option>Gatillo Mental</option>
                </select>
              </div>

              {campaignType === 'paid' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Variante A/B
                    </label>
                    <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none">
                      <option>Variante A</option>
                      <option>Variante B</option>
                      <option>Variante C</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Segmentación de Audiencia
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Edad (ej: 25-45)"
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Intereses"
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                className="w-full py-3 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: '#2D5016' }}
              >
                <Sparkles className="w-5 h-5" />
                Generar Contenido Automático
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-4" style={{ color: '#2D5016' }}>Vista Previa</h3>
            <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
              <div className="text-center">
                <Image className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">El contenido generado aparecerá aquí</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
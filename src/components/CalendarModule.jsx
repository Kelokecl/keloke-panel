// CalendarModule.jsx
import React, { useState, useEffect } from 'react';
import { Calendar as CalIcon, Clock, TrendingUp, Filter, Plus, Trash2, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CalendarModule() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduledContent, setScheduledContent] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);
  const [loading, setLoading] = useState(true);

  const optimalTimes = {
    instagram: [
      { time: '09:00', engagement: 'Alto', reason: 'Inicio del día laboral' },
      { time: '13:00', engagement: 'Muy Alto', reason: 'Hora de almuerzo' },
      { time: '19:00', engagement: 'Muy Alto', reason: 'Después del trabajo' },
ளம்: '21:00', engagement: 'Alto', reason: 'Horario nocturno' }
    ],
    tiktok: [
      { time: '12:00', engagement: 'Alto', reason: 'Hora de almuerzo' },
      { time: '18:00', engagement: 'Muy Alto', reason: 'Salida del trabajo' },
      { time: '20:00', engagement: 'Muy Alto', reason: 'Horario prime' },
      { time: '22:00', engagement: 'Alto', reason: 'Antes de dormir' }
    ],
    facebook: [
      { time: '08:00', engagement: 'Alto', reason: 'Inicio del día' },
      { time: '12:00', engagement: 'Muy Alto', reason: 'Hora de almuerzo' },
      { time: '17:00', engagement: 'Alto', reason: 'Fin de jornada' },
      { time: '20:00', engagement: 'Muy Alto', reason: 'Horario familiar' }
    ],
    youtube: [
      { time: '14:00', engagement: 'Alto', reason: 'Tarde' },
      { time: '19:00', engagement: 'Muy Alto', reason: 'Después del trabajo' },
      { time: '21:00', engagement: 'Muy Alto', reason: 'Horario nocturno' }
    ],
    whatsapp: [
      { time: '10:00', engagement: 'Alto', reason: 'Media mañana' },
      { time: '15:00', engagement: 'Alto', reason: 'Media tarde' },
      { time: '18:00', engagement: 'Muy Alto', reason: 'Fin de jornada' }
    ]
  };

  const toDateStr = (val) => {
    if (!val) return '';
    if (typeof val === 'string' && val.length >= 10) return val.slice(0, 10);
    try { return new Date(val).toISOString().slice(0, 10); } catch { return ''; }
  };

  useEffect(() => {
    loadScheduledContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedPlatform]);

  useEffect(() => {
    const handler = () => loadScheduledContent();
    window.addEventListener('calendar:refresh', handler);
    return () => window.removeEventListener('calendar:refresh', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedPlatform]);

  const loadScheduledContent = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('content_calendar')
        .select('*')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (selectedPlatform !== 'all') query = query.eq('platform', selectedPlatform);

      const { data, error } = await query;
      if (error) throw error;

      setScheduledContent(data || []);
    } catch (error) {
      console.error('Error loading scheduled content:', error);
    } finally {
      setLoading(false);
    }
  };

  const scheduleContent = async (contentData) => {
    try {
      const { error } = await supabase
        .from('content_calendar')
        .insert([{
          ...contentData,
          status: 'scheduled',
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      await loadScheduledContent();
      setShowScheduleModal(false);
      window.dispatchEvent(new CustomEvent('calendar:refresh'));
      alert('✅ Contenido programado exitosamente');
    } catch (error) {
      console.error('Error scheduling content:', error);
      alert('❌ Error al programar contenido');
    }
  };

  const deleteScheduledContent = async (id) => {
    if (!confirm('¿Eliminar este contenido programado?')) return;
    try {
      const { error } = await supabase.from('content_calendar').delete().eq('id', id);
      if (error) throw error;
      await loadScheduledContent();
      window.dispatchEvent(new CustomEvent('calendar:refresh'));
      alert('✅ Contenido eliminado');
    } catch (error) {
      console.error('Error deleting content:', error);
      alert('❌ Error al eliminar');
    }
  };

  const duplicateContent = async (content) => {
    try {
      const baseDateStr = toDateStr(content.scheduled_date);
      const [y, m, d] = baseDateStr.split('-').map(Number);
      const baseLocal = new Date(y, m - 1, d, 12, 0, 0);
      const nextLocal = new Date(baseLocal.getTime() + 86400000);
      const nextDateStr = nextLocal.toISOString().slice(0, 10);

      const newContent = {
        ...content,
        id: undefined,
        scheduled_date: nextDateStr,
        scheduled_time: (content.scheduled_time || '09:00').slice(0, 5),
        status: 'scheduled',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('content_calendar').insert([newContent]);
      if (error) throw error;

      await loadScheduledContent();
      window.dispatchEvent(new CustomEvent('calendar:refresh'));
      alert('✅ Contenido duplicado para el día siguiente');
    } catch (error) {
      console.error('Error duplicating content:', error);
      alert('❌ Error al duplicar');
    }
  };

  const getWeekDays = () => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getContentForDateTime = (date, time) => {
    const dateStr = date.toISOString().split('T')[0];
    return scheduledContent.filter((content) => {
      if (!content.scheduled_date) return false;
      const contentDate = String(content.scheduled_date).split('T')[0];
      const contentTime = String(content.scheduled_time || '').slice(0, 5);
      return contentDate === dateStr && contentTime === time;
    });
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setSelectedDate(newDate);
  };

  const platformColors = {
    instagram: '#E4405F',
    tiktok: '#000000',
    facebook: '#1877F2',
    youtube: '#FF0000',
    whatsapp: '#25D366'
  };

  const platformIcons = {
    instagram: '📸',
    tiktok: '🎵',
    facebook: '👥',
    youtube: '▶️',
    whatsapp: '💬'
  };

  const statusBadge = (s) => {
    const v = (s || '').toLowerCase();
    if (v === 'published') return { text: '✓ Publicado', cls: 'bg-green-100 text-green-700' };
    if (v === 'publishing') return { text: '⏳ Publicando', cls: 'bg-yellow-100 text-yellow-800' };
    if (v === 'failed') return { text: '⚠️ Falló', cls: 'bg-red-100 text-red-700' };
    return { text: '⏰ Programado', cls: 'bg-blue-100 text-blue-700' };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            Calendario Inteligente
          </h1>
          <p className="text-gray-600 mt-1">
            Programa contenido en horarios óptimos para Chile
          </p>
        </div>
        <button
          onClick={() => setShowScheduleModal(true)}
          className="px-6 py-3 rounded-lg text-white font-medium flex items-center gap-2 transition-all hover:opacity-90"
          style={{ backgroundColor: '#2D5016' }}
        >
          <Plus className="w-5 h-5" />
          Programar Contenido
        </button>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-[200px]">
              <p className="font-bold text-lg" style={{ color: '#2D5016' }}>
                {selectedDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
              </p>
              <p className="text-sm text-gray-600">
                Semana {Math.ceil((selectedDate.getDate() + new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay()) / 7)}
              </p>
            </div>

            <button onClick={() => navigateWeek(1)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>

            <button onClick={() => setSelectedDate(new Date())} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-medium">
              Hoy
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
            >
              <option value="all">Todas las plataformas</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
              <option value="youtube">YouTube</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>
      </div>

      {/* Optimal Times */}
      <div className="bg-gradient-to-r from-green-50 to-yellow-50 p-6 rounded-xl border border-green-200">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5" style={{ color: '#2D5016' }} />
          <h3 className="font-bold" style={{ color: '#2D5016' }}>
            Horarios Óptimos para Chile
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Object.entries(optimalTimes).map(([platform, times]) => (
            <div key={platform} className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{platformIcons[platform]}</span>
                <p className="font-medium text-sm capitalize">{platform}</p>
              </div>
              <div className="space-y-2">
                {times.map((slot, idx) => (
                  <div key={idx} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{slot.time}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        slot.engagement === 'Muy Alto'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {slot.engagement}
                      </span>
                    </div>
                    <p className="text-gray-500 mt-0.5">{slot.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-8 border-b border-gray-200">
          <div className="p-4 bg-gray-50 border-r border-gray-200 flex items-center justify-center">
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          {getWeekDays().map((day, idx) => {
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div key={idx} className={`p-4 text-center border-r border-gray-200 ${isToday ? 'bg-green-50' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-600 uppercase">
                  {day.toLocaleDateString('es-CL', { weekday: 'short' })}
                </p>
                <p className={`text-lg font-bold mt-1 ${isToday ? 'text-white px-2 py-1 rounded-full' : ''}`}
                   style={isToday ? { backgroundColor: '#2D5016' } : { color: '#2D5016' }}>
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {['08:00','09:00','10:00','12:00','13:00','14:00','15:00','17:00','18:00','19:00','20:00','21:00','22:00'].map((time) => (
            <div key={time} className="grid grid-cols-8 border-b border-gray-100 hover:bg-gray-50">
              <div className="p-3 bg-gray-50 border-r border-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-600">{time}</span>
              </div>
              {getWeekDays().map((day, idx) => {
                const content = getContentForDateTime(day, time);
                return (
                  <div key={idx} className="p-2 border-r border-gray-100 min-h-[80px] relative">
                    {content.map((item) => {
                      const sb = statusBadge(item.status);
                      return (
                        <div
                          key={item.id}
                          className="mb-2 p-2 rounded-lg text-xs cursor-pointer hover:shadow-md transition-all group"
                          style={{
                            backgroundColor: `${platformColors[item.platform]}15`,
                            borderLeft: `3px solid ${platformColors[item.platform]}`
                          }}
                          onClick={() => setSelectedContent(item)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{platformIcons[item.platform]}</span>
                            <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); duplicateContent(item); }}
                                className="p-1 hover:bg-white rounded"
                                title="Duplicar"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteScheduledContent(item.id); }}
                                className="p-1 hover:bg-white rounded text-red-600"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <p className="font-medium text-gray-800 line-clamp-2">
                            {item.title || item.content_type}
                          </p>

                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-gray-600 capitalize">{item.content_type}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sb.cls}`}>
                              {sb.text}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {loading && (
          <div className="p-4 text-sm text-gray-600 flex items-center gap-2">
            <CalIcon className="w-4 h-4" /> Cargando calendario...
          </div>
        )}
      </div>

      {showScheduleModal && (
        <ScheduleModal onClose={() => setShowScheduleModal(false)} onSchedule={scheduleContent} optimalTimes={optimalTimes} />
      )}

      {selectedContent && (
        <ContentDetailModal
          content={selectedContent}
          onClose={() => setSelectedContent(null)}
          onDelete={deleteScheduledContent}
          onDuplicate={duplicateContent}
        />
      )}
    </div>
  );
}

function ScheduleModal({ onClose, onSchedule, optimalTimes }) {
  const [formData, setFormData] = useState({
    platform: 'instagram',
    content_type: 'post',
    title: '',
    description: '',
    caption: '',
    hashtags: '',
    cta: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time: '09:00',
    product_id: null,
    campaign_type: 'organic',
  });

  const suggestedTimes = optimalTimes[formData.platform] || [];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSchedule(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold" style={{ color: '#2D5016' }}>
            Programar Contenido
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-all">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plataforma</label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none"
                required
              >
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook">Facebook</option>
                <option value="youtube">YouTube</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Contenido</label>
              <select
                value={formData.content_type}
                onChange={(e) => setFormData({ ...formData, content_type: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none"
                required
              >
                <option value="post">Post</option>
                <option value="reel">Reel/Video</option>
                <option value="story">Historia</option>
                <option value="carousel">Carrusel</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none"
              rows="4"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha</label>
              <input
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hora</label>
              <select
                value={formData.scheduled_time}
                onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none"
                required
              >
                {['08:00','09:00','10:00','12:00','13:00','14:00','15:00','17:00','18:00','19:00','20:00','21:00','22:00'].map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: '#2D5016' }} />
              <p className="font-medium text-sm" style={{ color: '#2D5016' }}>
                Horarios Recomendados para {formData.platform}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {suggestedTimes.map((slot, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFormData({ ...formData, scheduled_time: slot.time })}
                  className={`p-2 rounded-lg border-2 transition-all text-left ${
                    formData.scheduled_time === slot.time
                      ? 'border-green-600 bg-white'
                      : 'border-green-200 hover:border-green-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{slot.time}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      slot.engagement === 'Muy Alto'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {slot.engagement}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{slot.reason}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-all">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-6 py-3 rounded-lg text-white font-medium transition-all hover:opacity-90" style={{ backgroundColor: '#2D5016' }}>
              Programar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContentDetailModal({ content, onClose, onDelete, onDuplicate }) {
  const status = (content.status || 'scheduled').toLowerCase();
  const badge =
    status === 'published' ? 'bg-green-100 text-green-700' :
    status === 'publishing' ? 'bg-yellow-100 text-yellow-800' :
    status === 'failed' ? 'bg-red-100 text-red-700' :
    'bg-blue-100 text-blue-700';

  const statusText =
    status === 'published' ? '✓ Publicado' :
    status === 'publishing' ? '⏳ Publicando' :
    status === 'failed' ? '⚠️ Falló' :
    '⏰ Programado';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold" style={{ color: '#2D5016' }}>
            Detalle del Contenido
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-all">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-lg capitalize">{content.platform}</p>
              <p className="text-sm text-gray-600 capitalize">{content.content_type}</p>
            </div>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${badge}`}>
              {statusText}
            </span>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Título</p>
            <p className="text-lg font-bold">{content.title}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Descripción</p>
            <p className="text-gray-800 whitespace-pre-line">{content.description}</p>
          </div>

          {content.caption && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Caption</p>
              <p className="text-gray-800 whitespace-pre-line">{content.caption}</p>
            </div>
          )}

          {content.hashtags && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Hashtags</p>
              <p className="text-blue-700 whitespace-pre-line">{content.hashtags}</p>
            </div>
          )}

          {content.cta && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">CTA</p>
              <p className="text-gray-800">{content.cta}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Fecha Programada</p>
              <p className="text-gray-800">{String(content.scheduled_date).slice(0,10)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Hora</p>
              <p className="text-gray-800">{String(content.scheduled_time || '').slice(0,5)}</p>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => { onDuplicate(content); onClose(); }}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Duplicar
            </button>
            <button
              onClick={() => { onDelete(content.id); onClose(); }}
              className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

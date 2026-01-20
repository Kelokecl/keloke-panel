import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bot,
  Send,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Zap,
  Calendar
} from 'lucide-react';

function nowISO() {
  return new Date().toISOString();
}

async function safeInsert(table, row) {
  try {
    const { error } = await supabase.from(table).insert(row);
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

async function safeSelect(table, queryBuilder) {
  try {
    const { data, error } = await queryBuilder(supabase.from(table));
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export default function AIManagerModule() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadAIInsights();
    loadConversationHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadAIInsights() {
    // Si existe ai_insights, úsala. Si no, construimos insights desde tablas reales.
    const data = await safeSelect('ai_insights', (t) =>
      t.select('*').order('created_at', { ascending: false }).limit(1).single()
    );

    if (data) {
      setAiInsights(data);
      return;
    }

    // Fallback: reconstruimos con conteos de tablas reales
    try {
      const [productsCount, scheduledCount, automationsCount, failedCount] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
        // automations: enabled o is_active
        (async () => {
          const a1 = await supabase.from('automations').select('id', { count: 'exact', head: true }).eq('enabled', true);
          if (!a1.error) return a1.count || 0;
          const a2 = await supabase.from('automations').select('id', { count: 'exact', head: true }).eq('is_active', true);
          if (!a2.error) return a2.count || 0;
          return 0;
        })(),
        supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ]);

      setAiInsights({
        active_products: productsCount.count || 0,
        scheduled_content: scheduledCount.count || 0,
        active_automations: automationsCount || 0,
        pending_alerts: failedCount.count || 0,
      });
    } catch {
      setAiInsights({
        active_products: 0,
        scheduled_content: 0,
        active_automations: 0,
        pending_alerts: 0,
      });
    }
  }

  async function loadConversationHistory() {
    // Si no existe ai_conversations, no rompemos: partimos vacío.
    const data = await safeSelect('ai_conversations', (t) =>
      t.select('*').order('created_at', { ascending: true }).limit(50)
    );

    if (data && Array.isArray(data) && data.length > 0) {
      setMessages(data);
    } else {
      setMessages([]);
    }
  }

  async function handleSendMessage() {
    if (!inputMessage.trim() || isLoading) return;

    const raw = inputMessage.trim();

    const userMessage = {
      role: 'user',
      content: raw,
      created_at: nowISO(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Guardar mensaje usuario si existe la tabla
    await safeInsert('ai_conversations', { role: 'user', content: raw });

    try {
      // 1) Intentamos responder usando tu Edge Function "autogerente" (v1)
      const { data, error } = await supabase.functions.invoke('autogerente', {
        body: {
          message: raw,
          channel: 'panel',
          user_id: null,
        },
      });

      if (error) throw error;

      // data.reply es lo principal; data.actions opcional
      const reply = data?.reply || 'OK.';

      const assistantMessage = {
        role: 'assistant',
        content: reply,
        created_at: nowISO(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      await safeInsert('ai_conversations', { role: 'assistant', content: reply });

      // Refrescamos insights por si cambió algo
      loadAIInsights();
    } catch (e) {
      console.error('AI error:', e);
      const assistantMessage = {
        role: 'assistant',
        content:
          'Tuve un problema conectando con el Auto-Gerente. Revisa que la Edge Function "autogerente" esté desplegada y disponible.',
        created_at: nowISO(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      await safeInsert('ai_conversations', { role: 'assistant', content: assistantMessage.content });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#D4A017' }}>
            <Bot className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Auto-Gerente IA</h1>
            <p className="text-gray-600">Motor: Edge Function “autogerente” (v1)</p>
          </div>
        </div>
      </div>

      {/* AI Insights Cards */}
      {aiInsights && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4" style={{ color: '#2D5016' }} />
              <span className="text-xs text-gray-600">Productos Activos</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
              {aiInsights.active_products || 0}
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4" style={{ color: '#2D5016' }} />
              <span className="text-xs text-gray-600">Contenido Programado</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
              {aiInsights.scheduled_content || 0}
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4" style={{ color: '#2D5016' }} />
              <span className="text-xs text-gray-600">Automatizaciones</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
              {aiInsights.active_automations || 0}
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" style={{ color: '#D4A017' }} />
              <span className="text-xs text-gray-600">Alertas</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#D4A017' }}>
              {aiInsights.pending_alerts || 0}
            </p>
          </div>
        </div>
      )}

      {/* Chat Container */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#F5E6D3' }}>
                <Sparkles className="w-10 h-10" style={{ color: '#D4A017' }} />
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: '#2D5016' }}>
                ¡Hola! Soy tu Auto-Gerente IA
              </h3>
              <p className="text-gray-600 max-w-md">
                Puedo ayudarte con contenido, calendario, diagnóstico de fallos y próximos pasos. Escríbeme lo que necesitas.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    msg.role === 'user' ? 'text-white' : 'bg-gray-50 text-gray-800'
                  }`}
                  style={msg.role === 'user' ? { backgroundColor: '#2D5016' } : {}}
                >
                  <div className="flex items-start gap-2">
                    {msg.role === 'assistant' && (
                      <Bot className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#D4A017' }} />
                    )}
                    <div className="flex-1">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-xs mt-2 ${msg.role === 'user' ? 'text-white/70' : 'text-gray-500'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 rounded-lg p-4 max-w-[70%]">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5" style={{ color: '#D4A017' }} />
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Escribe tu mensaje al Auto-Gerente IA..."
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-700/30"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-6 py-3 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
              style={{ backgroundColor: '#2D5016' }}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

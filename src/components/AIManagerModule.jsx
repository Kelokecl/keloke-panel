import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bot,
  Send,
  Sparkles,
  AlertCircle,
  Zap,
  Calendar,
  TrendingUp
} from 'lucide-react';

export default function AIManagerModule() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bootError, setBootError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function boot() {
    try {
      setBootError(null);

      // cargar historial si existe tabla
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) setMessages(data);
    } catch (e) {
      console.error(e);
      setBootError('No pude cargar historial. (Revisa que exista la tabla ai_conversations)');
    }
  }

  async function handleSendMessage() {
    if (!inputMessage.trim() || isLoading) return;

    const content = inputMessage.trim();
    const userMsg = { role: 'user', content, created_at: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Guardar user msg
      await supabase.from('ai_conversations').insert({ role: 'user', content });

      // Llamar a Edge Function copiloto (GPT-5-mini por backend)
      const { data, error } = await supabase.functions.invoke('autogerente-copilot', {
        body: { message: content, channel: 'panel' }
      });

      if (error) throw error;

      const reply = data?.reply || 'Recibido. ¿Qué acción quieres ejecutar?';
      const actions = Array.isArray(data?.actions) ? data.actions : [];

      const assistantMsg = {
        role: 'assistant',
        content: formatAssistant(reply, actions),
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMsg]);

      await supabase.from('ai_conversations').insert({
        role: 'assistant',
        content: assistantMsg.content
      });

    } catch (e) {
      console.error(e);
      const assistantMsg = {
        role: 'assistant',
        content: '⚠️ Error al procesar el mensaje. Revisa consola / Edge Function autogerente-copilot.',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMsg]);
      await supabase.from('ai_conversations').insert({ role: 'assistant', content: assistantMsg.content }).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }

  function formatAssistant(reply, actions) {
    let out = reply;
    if (actions.length > 0) {
      out += '\n\nAcciones sugeridas:\n';
      out += actions.map((a) => `• ${a.type}${a.note ? ` — ${a.note}` : ''}`).join('\n');
    }
    return out;
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
            <p className="text-gray-600">Copiloto del negocio (sugerencias + alertas + ganadores)</p>
          </div>
        </div>

        {bootError && (
          <div className="mt-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 text-sm">
            {bootError}
          </div>
        )}
      </div>

      {/* Quick buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <QuickCmd
          icon={<Sparkles className="w-4 h-4" />}
          title="Generar sugerencias"
          subtitle="Crea recomendaciones y las guarda en Dashboard"
          onClick={() => setInputMessage('Genera 5 sugerencias accionables para hoy en Keloke Chile basadas en mis datos actuales.')}
        />
        <QuickCmd
          icon={<TrendingUp className="w-4 h-4" />}
          title="Actualizar ganadores"
          subtitle="Pide ranking semanal (si está habilitado trends)"
          onClick={() => setInputMessage('Actualiza el top 10 semanal de productos ganadores para Chile y justifica el score.')}
        />
        <QuickCmd
          icon={<Calendar className="w-4 h-4" />}
          title="Plan de contenido"
          subtitle="Ideas + programación recomendada"
          onClick={() => setInputMessage('Dame un plan de 7 días de contenido para Instagram y TikTok basado en productos ganadores.')}
        />
      </div>

      {/* Chat */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
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
                Puedo dejar sugerencias en el Dashboard, ayudarte a priorizar productos, plan de contenido, y monitoreo de negocio.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${msg.role === 'user' ? 'text-white' : 'bg-gray-50 text-gray-800'}`}
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
                  <span className="text-sm text-gray-600">Pensando…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Escribe tu mensaje al Auto-Gerente IA…"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50"
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

          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Tip: escribe “Genera sugerencias para hoy” y luego revisa el Dashboard.
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCmd({ icon, title, subtitle, onClick }) {
  return (
    <button onClick={onClick} className="p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 text-left">
      <div className="flex items-center gap-2 mb-1" style={{ color: '#2D5016' }}>
        {icon}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <p className="text-xs text-gray-600">{subtitle}</p>
    </button>
  );
}

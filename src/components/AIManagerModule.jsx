import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Bot, 
  Send, 
  Sparkles, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  MessageSquare,
  BarChart3,
  Calendar,
  ShoppingBag
} from 'lucide-react';

export default function AIManagerModule() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadAIInsights();
    loadConversationHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  async function loadAIInsights() {
    try {
      const { data: stats } = await supabase
        .from('ai_insights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (stats) {
        setAiInsights(stats);
      }
    } catch (error) {
      console.error('Error loading AI insights:', error);
    }
  }

  async function loadConversationHistory() {
    try {
      const { data } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

      if (data) {
        setMessages(data);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  }

  async function handleSendMessage() {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Guardar mensaje del usuario
      await supabase.from('ai_conversations').insert({
        role: 'user',
        content: inputMessage
      });

      // Simular respuesta de Claude IA
      const aiResponse = await generateAIResponse(inputMessage);

      const assistantMessage = {
        role: 'assistant',
        content: aiResponse,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Guardar respuesta de IA
      await supabase.from('ai_conversations').insert({
        role: 'assistant',
        content: aiResponse
      });

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta nuevamente.',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  async function generateAIResponse(userInput) {
    // Aquí se integrará Claude AI
    // Por ahora, respuestas inteligentes basadas en contexto
    
    const input = userInput.toLowerCase();

    if (input.includes('producto') || input.includes('ganador')) {
      const { data: products } = await supabase
        .from('winning_products')
        .select('*')
        .eq('status', 'active')
        .order('tiktok_score', { ascending: false })
        .limit(3);

      if (products && products.length > 0) {
        return `He analizado tus productos ganadores. Los top 3 son:\n\n${products.map((p, i) => 
          `${i + 1}. ${p.product_name} - Score: ${p.tiktok_score}/10 - Precio sugerido: $${p.suggested_price_clp.toLocaleString('es-CL')}`
        ).join('\n')}\n\nTe recomiendo enfocarte en estos productos para maximizar tus ventas.`;
      }
    }

    if (input.includes('contenido') || input.includes('publicar')) {
      const { data: content } = await supabase
        .from('generated_content')
        .select('*')
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true })
        .limit(5);

      if (content && content.length > 0) {
        return `Tienes ${content.length} publicaciones programadas. La próxima es para ${new Date(content[0].scheduled_date).toLocaleDateString('es-CL')}. ¿Quieres que revise el contenido o genere nuevas ideas?`;
      }
      return 'No tienes contenido programado aún. ¿Quieres que te ayude a generar contenido para tus redes sociales?';
    }

    if (input.includes('alerta') || input.includes('notificación')) {
      const { data: alerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (alerts && alerts.length > 0) {
        return `Tienes ${alerts.length} alertas pendientes:\n\n${alerts.slice(0, 3).map(a => 
          `• ${a.title}: ${a.message}`
        ).join('\n')}\n\n¿Quieres que te ayude a resolverlas?`;
      }
      return 'No tienes alertas pendientes. Todo está funcionando correctamente.';
    }

    if (input.includes('analítica') || input.includes('métricas') || input.includes('rendimiento')) {
      return 'Estoy analizando tus métricas en tiempo real. Basándome en los datos actuales, te recomiendo:\n\n1. Aumentar la frecuencia de publicaciones en Instagram (mejor engagement)\n2. Probar contenido de video corto en TikTok\n3. Revisar los productos con bajo rendimiento\n\n¿Quieres un análisis más detallado?';
    }

    if (input.includes('automatización') || input.includes('automatizar')) {
      return 'Puedo ayudarte a configurar automatizaciones para:\n\n• Publicación automática de contenido\n• Respuestas automáticas en WhatsApp\n• Alertas de productos con bajo stock\n• Reportes semanales de rendimiento\n\n¿Cuál te gustaría configurar primero?';
    }

    // Respuesta general inteligente
    return `Entiendo tu consulta sobre "${userInput}". Como tu Auto-Gerente IA, estoy aquí para ayudarte con:\n\n• Análisis de productos ganadores\n• Generación y programación de contenido\n• Monitoreo de métricas y alertas\n• Automatizaciones inteligentes\n• Optimización de estrategias\n\n¿En qué área específica necesitas ayuda?`;
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
            <p className="text-gray-600">Asistente inteligente con Claude AI</p>
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
              <span className="text-xs text-gray-600">Alertas Pendientes</span>
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
                Estoy aquí para ayudarte a optimizar tu negocio, analizar datos, generar contenido y automatizar procesos. ¿En qué puedo ayudarte hoy?
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'bg-gray-50 text-gray-800'
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
                        {new Date(msg.created_at).toLocaleTimeString('es-CL', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
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
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Escribe tu mensaje al Auto-Gerente IA..."
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50"
              style={{ focusRingColor: '#2D5016' }}
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
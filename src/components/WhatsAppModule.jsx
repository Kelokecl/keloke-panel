import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, Loader, MessageCircle, Bot, ArrowLeft } from 'lucide-react';
import WhatsAppConversationsList from './whatsapp/WhatsAppConversationsList';
import WhatsAppChatView from './whatsapp/WhatsAppChatView';
import WhatsAppClientModal from './whatsapp/WhatsAppClientModal';
import WhatsAppAIConfig from './whatsapp/WhatsAppAIConfig';

export default function WhatsAppModule() {
  const [connection, setConnection] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [modalContact, setModalContact] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState('chat'); // 'chat' o 'ai-config'
  const [aiConfig, setAiConfig] = useState(null);

  useEffect(() => {
    loadConnection();
    loadAIConfig();
  }, []);

  async function loadConnection() {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('social_connections')
        .select('*')
        .eq('platform', 'whatsapp')
        .eq('is_active', true)
        .single();

      if (error) throw error;
      setConnection(data);
    } catch (err) {
      console.error('Error loading connection:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAIConfig() {
    try {
      const { data } = await supabase.from('whatsapp_ai_config').select('*').single();
      setAiConfig(data);
    } catch (err) {
      console.error('Error loading AI config:', err);
    }
  }

  function handleShowClientInfo(contact) {
    setModalContact(contact);
    setShowClientModal(true);
  }

  function handleCloseModal() {
    setShowClientModal(false);
    setModalContact(null);
  }

  function handleSaveContact() {
    // Recargar contacto si es necesario
    if (selectedContact?.phone_number === modalContact?.phone_number) {
      // Actualizar el contacto seleccionado con los nuevos datos
    }
  }

  const isChatView = currentView === 'chat';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-yellow-900 mb-2">WhatsApp no está conectado</h2>
          <p className="text-yellow-700 mb-4">
            Por favor, ve a la sección de Conexiones y conecta tu cuenta de WhatsApp Business
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header fijo */}
      <div className="bg-green-600 text-white px-4 md:px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <MessageCircle className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">WhatsApp Business</h1>
            <p className="text-sm text-green-100 truncate">{connection.username || 'Conectado'}</p>
          </div>
        </div>

        {/* Tabs y estado de IA */}
        <div className="flex items-center gap-3">
          {/* Indicador de IA */}
          {aiConfig?.is_enabled && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-purple-500 rounded-lg">
              <Bot className="w-4 h-4" />
              <span className="text-xs font-medium">IA Activa</span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-green-700 rounded-lg p-1">
            <button
              onClick={() => {
                setCurrentView('chat');
                // opcional: si vuelves a chat en móvil, mantén selección
              }}
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'chat' ? 'bg-white text-green-600' : 'text-white hover:bg-green-600'
              }`}
            >
              <MessageCircle className="w-4 h-4 inline-block mr-2" />
              Chat
            </button>

            <button
              onClick={() => {
                setCurrentView('ai-config');
                // en móvil tiene sentido limpiar selección para no “quedar atrapado”
                setSelectedContact(null);
              }}
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'ai-config' ? 'bg-white text-purple-600' : 'text-white hover:bg-green-600'
              }`}
            >
              <Bot className="w-4 h-4 inline-block mr-2" />
              IA
            </button>
          </div>
        </div>
      </div>

      {/* Layout principal */}
      {isChatView ? (
        <div className="flex-1 flex overflow-hidden">
          {/* LISTA (mobile: solo si NO hay contacto seleccionado) */}
          <div
            className={[
              'w-full md:w-96 border-r bg-white',
              selectedContact ? 'hidden md:block' : 'block',
            ].join(' ')}
          >
            <WhatsAppConversationsList onSelectContact={setSelectedContact} selectedContact={selectedContact} />
          </div>

          {/* CHAT (mobile: solo si hay contacto seleccionado) */}
          <div
            className={[
              'flex-1 min-w-0 bg-white',
              selectedContact ? 'block' : 'hidden md:block',
            ].join(' ')}
          >
            {/* Header móvil para volver */}
            <div className="md:hidden bg-white border-b px-3 py-2 flex items-center gap-2">
              <button
                onClick={() => setSelectedContact(null)}
                className="p-2 rounded-full hover:bg-gray-100"
                aria-label="Volver a conversaciones"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">
                  {selectedContact?.contact_name || selectedContact?.phone_number || 'Chat'}
                </div>
                <div className="text-xs text-gray-500 truncate">{selectedContact?.phone_number || ''}</div>
              </div>
            </div>

            <WhatsAppChatView contact={selectedContact} connection={connection} onShowClientInfo={handleShowClientInfo} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <WhatsAppAIConfig onConfigUpdate={loadAIConfig} />
        </div>
      )}

      {/* Modal de datos del cliente */}
      {showClientModal && modalContact && (
        <WhatsAppClientModal contact={modalContact} onClose={handleCloseModal} onSave={handleSaveContact} />
      )}
    </div>
  );
}

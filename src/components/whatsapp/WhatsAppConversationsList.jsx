import { useState, useEffect } from 'react';
import { Search, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import WhatsAppConversationItem from './WhatsAppConversationItem';

export default function WhatsAppConversationsList({ onSelectContact, selectedContact }) {
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
    
    // Auto-refresh cada 5 segundos
    const interval = setInterval(loadConversations, 5000);
    
    // Suscripción en tiempo real a nuevos mensajes
    const subscription = supabase
      .channel('whatsapp_messages_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  async function loadConversations() {
    try {
      // Obtener todos los contactos ordenados por último mensaje
      const { data: contactsData, error: contactsError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (contactsError) throw contactsError;

      // Para cada contacto, obtener el último mensaje y contar no leídos
      const contactsWithMessages = await Promise.all(
        contactsData.map(async (contact) => {
          // Último mensaje
          // CORRECCIÓN ERROR 406: NO usar .single() con .limit(1)
          // .single() espera un objeto pero .limit(1) devuelve un array
          // Esto causa el header Accept: application/vnd.pgrst.object+json que genera 406
          const { data: lastMsgArray } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('phone_number', contact.phone_number)
            .order('created_at', { ascending: false })
            .limit(1);
          
          // Acceder al primer elemento del array (o null si está vacío)
          const lastMsg = lastMsgArray?.[0] || null;

          // Mensajes no leídos (solo entrantes)
          const { count: unreadCount } = await supabase
  .from('whatsapp_messages')
  .select('id', { count: 'exact' })
  .eq('phone_number', contact.phone_number)
  .eq('direction', 'inbound')
  .eq('is_read', false);

          return {
            contact,
            lastMessage: lastMsg,
            unreadCount: unreadCount || 0,
          };
        })
      );

      setContacts(contactsWithMessages);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredContacts = contacts.filter(({ contact }) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      contact.contact_name?.toLowerCase().includes(searchLower) ||
      contact.phone_number.includes(searchTerm)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r">
      {/* Buscador */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar conversación..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Lista de conversaciones */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-gray-500">
              {searchTerm ? 'No se encontraron conversaciones' : 'No hay conversaciones activas'}
            </p>
          </div>
        ) : (
          filteredContacts.map(({ contact, lastMessage, unreadCount }) => (
            <WhatsAppConversationItem
              key={contact.id}
              contact={contact}
              lastMessage={lastMessage}
              unreadCount={unreadCount}
              isActive={selectedContact?.phone_number === contact.phone_number}
              onClick={() => onSelectContact(contact)}
            />
          ))
        )}
      </div>
    </div>
  );
}

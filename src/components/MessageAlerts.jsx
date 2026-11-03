import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const channels = new Set(['whatsapp', 'instagram']);
export default function MessageAlerts() {
  const { user } = useAuth();
  const [notice, setNotice] = useState(null);
  const [permission, setPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const seen = useRef(new Set());
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    let active = true;
    let polling = false;
    const started = Date.now();
    const startedIso = new Date(started).toISOString();
    const announce = row => {
      if (!active || !channels.has(row.source) || !['message', 'comment', 'email'].includes(row.type) || row.is_read) return;
      const version = row.updated_at || row.created_at;
      if (Date.parse(version) < started) return;
      const key = `${row.id}:${version}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value);
      const target = row.source === 'instagram' ? '/instagram' : row.source === 'whatsapp' ? '/whatsapp' : '/correo';
      const title = row.source === 'whatsapp' ? 'Nuevo mensaje de WhatsApp' : row.source === 'instagram' ? 'Nuevo mensaje de Instagram' : 'Nuevo correo';
      setNotice({ title, target });
      // Keep message bodies out of system notifications and lock screens.
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        const notification = new Notification(title, { body: 'Abre Keloke para revisarlo.', tag: `keloke-${row.id}` });
        notification.onclick = () => { window.focus(); window.location.assign(target); notification.close(); };
      }
    };
    const poll = async () => {
      if (polling || !active) return;
      polling = true;
      try {
        const { data, error } = await supabase.from('dashboard_alerts')
          .select('id,source,type,is_read,created_at,updated_at')
          .eq('is_read', false).in('source', [...channels])
          .gte('updated_at', startedIso).order('updated_at', { ascending: true }).limit(50);
        if (!error) (data || []).forEach(announce);
      } catch { /* Retry on the next interval after a transient connection failure. */ } finally { polling = false; }
    };
    const subscription = supabase.channel(`message-alerts-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_alerts' }, payload => announce(payload.new))
      .subscribe();
    const interval = setInterval(poll, 15000);
    window.addEventListener('focus', poll);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', poll); supabase.removeChannel(subscription); };
  }, [user?.id, user?.role]);
  if (user?.role !== 'admin') return null;
  return <div className="message-alert-bar" aria-label="Alertas de mensajes">
    <span className="">Avisos de mensajes mientras el panel esté abierto.</span>
    {permission === 'default' && <button className="" onClick={async () => setPermission(await Notification.requestPermission())}>Activar avisos del navegador</button>}
    {permission === 'granted' && <span className="text-xs text-green-700">Avisos del navegador activados</span>}
    {permission === 'denied' && <span className="text-xs text-gray-600">Avisos bloqueados por el navegador; verás los avisos aquí.</span>}
    {notice && <div role="status" className="w-full flex justify-between rounded bg-green-50 p-3"><Link className="font-semibold text-green-900" to={notice.target}>{notice.title} · Abrir</Link><button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div>}
  </div>;
}

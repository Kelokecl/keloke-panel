import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Loader } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn(email, password);

    if (!result.success) {
      setError(result.error || 'Error al iniciar sesión');
    }

    setLoading(false);
  }

  return <div className="login-page">
    <section className="login-story"><div className="brand"><span className="brand-symbol">k<span>•</span></span><span>keloke<span className="brand-period">.</span><small>MARKETING WORKSPACE</small></span></div><span className="eyebrow !text-[#a8c894]">MENOS RUIDO. MÁS FOCO.</span><h1>Conecta con tu<br/>próxima <span>venta.</span></h1><p>Tu marketing, tus redes y tus conversaciones. Un espacio para hacer crecer tu negocio.</p><div className="login-tags"><span>Redes sociales</span><span>Contenido</span><span>Ventas</span></div></section>
    <section className="login-form-side"><div className="login-card"><span className="eyebrow">TU ESPACIO DE TRABAJO</span><h2>Bienvenido a Keloke</h2><p>Ingresa para organizar tus canales, crear contenido y atender a tus clientes.</p><form onSubmit={handleSubmit}>
      {error&&<div className="error-banner" role="alert">{error}</div>}
      <div><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="tu@empresa.cl"/></div>
      <div><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Tu contraseña"/></div>
      <button type="submit" disabled={loading} className="primary-button">{loading?<Loader size={17} className="animate-spin"/>:<LogIn size={17}/>} {loading?'Iniciando sesión…':'Ingresar a mi espacio'}</button>
    </form><div className="login-footer">Acceso privado · Keloke SpA<br/>Marketing, redes sociales y ventas en un solo lugar.</div></div></section>
  </div>;
}

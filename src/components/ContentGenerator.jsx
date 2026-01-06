import { useState } from 'react';

export default function ContentGenerator() {
  // Estados para campos del formulario
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [strategy, setStrategy] = useState('');
  const [tone, setTone] = useState('');
  const [campaignType, setCampaignType] = useState('Orgánica');
  const [platform, setPlatform] = useState('Instagram');
  const [format, setFormat] = useState('Post');

  // Estados para resultado y control de UI
  const [generatedContent, setGeneratedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(null);
  const [published, setPublished] = useState({}); // Track published status per platform

  // Configuración de Supabase (asegúrate de configurar las variables de entorno en Vercel)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Construir URL de función edge de Supabase
  const functionEndpoint = supabaseUrl
    ? supabaseUrl.replace('.supabase.co', '.functions.supabase.co') + '/generate-content'
    : '';

  // Maneja la generación de contenido llamando a la función de Supabase
  const handleGenerate = async () => {
    // Validar campos requeridos
    if (!productName || !price || !strategy || !tone || !campaignType || !platform || !format) {
      alert('Por favor, completa todos los campos del formulario.');
      return;
    }
    try {
      setError(null);
      setGeneratedContent(''); // limpiar contenido anterior
      setLoading(true);
      // Preparar datos para enviar
      const payload = {
        productName,
        price,
        strategy,
        tone,
        campaignType,
        platform,
        format,
      };
      // Llamada a la función 'generate-content' en Supabase mediante fetch
      const response = await fetch(functionEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : undefined,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error('Error generando contenido:', response.status, response.statusText);
        setError('Error al generar el contenido. Por favor intenta nuevamente.');
        return;
      }
      // Intentar obtener respuesta como JSON; si falla, obtener como texto
      const textData = await response.text();
      let contentResult = '';
      try {
        const data = JSON.parse(textData);
        contentResult = data.content || data || '';
      } catch {
        contentResult = textData;
      }
      setGeneratedContent(contentResult);
    } catch (err) {
      console.error('Error en petición de generación:', err);
      setError('Error de red al generar el contenido.');
    } finally {
      setLoading(false);
    }
  };

  // Copiar contenido generado al portapapeles
  const handleCopy = async () => {
    if (!generatedContent) return;
    try {
      await navigator.clipboard.writeText(generatedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
      alert('No se pudo copiar el contenido.');
    }
  };

  // Guardar contenido (requiere implementación de API o supabase - placeholder)
  const handleSave = async () => {
    if (!generatedContent) return;
    try {
      // Llamar a la API de guardado (debe ser implementada en el backend)
      const res = await fetch('/api/save-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          price,
          strategy,
          tone,
          campaignType,
          platform,
          format,
          content: generatedContent,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        console.error('Error al guardar:', await res.text());
        alert('Error al guardar el contenido.');
      }
    } catch (err) {
      console.error('Error en guardado:', err);
      alert('Error al guardar el contenido.');
    }
  };

  // Vista previa: simplemente abrir el modal de vista previa
  const handlePreview = () => {
    if (!generatedContent) return;
    setPreview(true);
  };

  // Publicar contenido en una plataforma específica (requiere implementación backend para cada plataforma)
  const publishToPlatform = async (platformName) => {
    if (!generatedContent || publishing) return;
    // TikTok no implementado
    if (platformName === 'TikTok') {
      alert('Integración con TikTok pendiente.');
      return;
    }
    try {
      setPublishing(platformName);
      // Llamar a la API de publicación correspondiente (debe implementarse en backend)
      const res = await fetch(`/api/publish/${platformName.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: generatedContent }),
      });
      if (res.ok) {
        setPublished((prev) => ({ ...prev, [platformName]: true }));
        // Podrías mostrar una notificación de éxito aquí
      } else {
        console.error(`Error al publicar en ${platformName}:`, await res.text());
        alert(`Error al publicar en ${platformName}.`);
      }
    } catch (err) {
      console.error(`Error de red al publicar en ${platformName}:`, err);
      alert(`Error al publicar en ${platformName}.`);
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="content-generator">
      {/* Sección de formulario */}
      <div className="form-section">
        <h2>Generador de Contenido</h2>
        <div className="form-grid">
          <label>
            <span>Nombre del producto:</span>
            <input 
              type="text" 
              value={productName} 
              onChange={(e) => setProductName(e.target.value)} 
              placeholder="Ingresa el nombre del producto"
            />
          </label>
          <label>
            <span>Precio:</span>
            <input 
              type="number" 
              value={price} 
              onChange={(e) => setPrice(e.target.value)} 
              placeholder="Ej: 49.99"
            />
          </label>
          <label>
            <span>Estrategia:</span>
            <input 
              type="text" 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)} 
              placeholder="Ej: Promoción limitada, destacar beneficios"
            />
          </label>
          <label>
            <span>Tono:</span>
            <input 
              type="text" 
              value={tone} 
              onChange={(e) => setTone(e.target.value)} 
              placeholder="Ej: Cercano y divertido, Profesional"
            />
          </label>
          <div className="radio-group">
            <span>Tipo de campaña:</span>
            <label>
              <input 
                type="radio" 
                name="campaignType" 
                value="Orgánica" 
                checked={campaignType === 'Orgánica'} 
                onChange={(e) => setCampaignType(e.target.value)} 
              />
              Orgánica
            </label>
            <label>
              <input 
                type="radio" 
                name="campaignType" 
                value="Pagada" 
                checked={campaignType === 'Pagada'} 
                onChange={(e) => setCampaignType(e.target.value)} 
              />
              Pagada
            </label>
          </div>
          <label>
            <span>Plataforma:</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option>Instagram</option>
              <option>Facebook</option>
              <option>YouTube</option>
              <option>Shopify</option>
              <option>WhatsApp</option>
              <option>TikTok</option>
            </select>
          </label>
          <label>
            <span>Formato:</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option>Post</option>
              <option>Reel</option>
              <option>Historia</option>
              <option>Carrusel</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button 
            className="btn btn-primary" 
            onClick={handleGenerate} 
            disabled={loading}
          >
            {loading ? 'Generando...' : 'Generar contenido'}
          </button>
        </div>
      </div>

      {/* Sección de resultado */}
      <div className="output-section">
        {error && <p className="error">{error}</p>}
        {loading && !error && <p>Generando contenido...</p>}
        {!loading && !generatedContent && !error && (
          <p className="placeholder">El contenido generado aparecerá aquí.</p>
        )}
        {generatedContent && (
          <div className="card">
            <h3>Contenido Generado:</h3>
            <div className="output-text">{generatedContent}</div>
          </div>
        )}
        {/* Botones de acciones (copiar, guardar, vista previa) */}
        {generatedContent && (
          <div className="output-actions">
            <button className="btn btn-secondary" onClick={handleCopy} disabled={!generatedContent || loading}>
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
            <button className="btn btn-secondary" onClick={handleSave} disabled={!generatedContent || loading}>
              {saved ? '¡Guardado!' : 'Guardar'}
            </button>
            <button className="btn btn-secondary" onClick={handlePreview} disabled={!generatedContent || loading}>
              Vista previa
            </button>
          </div>
        )}
        {/* Botones de publicación en plataformas */}
        {generatedContent && (
          <div className="publish-actions">
            <span>Publicar en:</span>
            <button 
              className="icon-button instagram-btn" 
              onClick={() => publishToPlatform('Instagram')} 
              title="Publicar en Instagram"
              disabled={!generatedContent || loading || publishing !== null || !!published.Instagram}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/>
              </svg>
            </button>
            <button 
              className="icon-button facebook-btn" 
              onClick={() => publishToPlatform('Facebook')} 
              title="Publicar en Facebook"
              disabled={!generatedContent || loading || publishing !== null || !!published.Facebook}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/>
              </svg>
            </button>
            <button 
              className="icon-button youtube-btn" 
              onClick={() => publishToPlatform('YouTube')} 
              title="Publicar en YouTube"
              disabled={!generatedContent || loading || publishing !== null || !!published.YouTube}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.007 2.007 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.007 2.007 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31.4 31.4 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.007 2.007 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A99.788 99.788 0 0 1 7.858 2h.193zM6.4 5.209v4.818l4.157-2.408L6.4 5.209z"/>
              </svg>
            </button>
            <button 
              className="icon-button shopify-btn" 
              onClick={() => publishToPlatform('Shopify')} 
              title="Publicar en Shopify"
              disabled={!generatedContent || loading || publishing !== null || !!published.Shopify}
            >
              {/* Usamos emoji de bolsa de compras como placeholder para Shopify */}
              <span role="img" aria-label="Shopify" style={{ fontSize: '24px' }}>🛍️</span>
            </button>
            <button 
              className="icon-button whatsapp-btn" 
              onClick={() => publishToPlatform('WhatsApp')} 
              title="Publicar en WhatsApp"
              disabled={!generatedContent || loading || publishing !== null || !!published.WhatsApp}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
              </svg>
            </button>
            {/* TikTok integration pending: button is disabled */}
            <button 
              className="icon-button tiktok-btn" 
              title="Publicar en TikTok (integración pendiente)"
              disabled
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Modal de Vista Previa */}
      {preview && (
        <div className="modal-overlay">
          <div className="modal">
            <button className="close-btn" onClick={() => setPreview(false)} title="Cerrar vista previa">×</button>
            <h3>Vista Previa</h3>
            <div className="output-text">{generatedContent}</div>
          </div>
        </div>
      )}

      {/* Estilos en línea (styled-jsx) */}
      <style jsx>{`
        .content-generator {
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          margin-top: 2rem;
        }
        .form-section {
          flex: 1 1 320px;
        }
        .output-section {
          flex: 1 1 320px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem 2rem;
        }
        .form-grid label, .form-grid .radio-group {
          display: flex;
          flex-direction: column;
        }
        .form-grid label span {
          margin-bottom: 0.25rem;
          font-weight: 500;
        }
        .radio-group {
          margin-bottom: 1rem;
        }
        .radio-group span {
          font-weight: 500;
          margin-bottom: 0.25rem;
        }
        .radio-group label {
          font-weight: normal;
          display: inline-flex;
          align-items: center;
          margin-right: 1rem;
        }
        .radio-group label input {
          margin-right: 0.25rem;
        }
        input, select {
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .actions {
          text-align: right;
          margin-top: 1rem;
        }
        .btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 0.5rem;
        }
        .btn-primary {
          background-color: #0070f3;
          color: #fff;
        }
        .btn-primary:disabled {
          background-color: #7aa0c4;
          cursor: not-allowed;
        }
        .btn-secondary {
          background-color: #e0e0e0;
          color: #000;
        }
        .btn-secondary:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        .output-section .card {
          background: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .output-text {
          white-space: pre-wrap;
        }
        .output-actions, .publish-actions {
          margin-bottom: 1rem;
          margin-top: 0.5rem;
        }
        .output-actions .btn {
          margin-right: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .publish-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .publish-actions span {
          font-weight: 500;
          margin-right: 0.5rem;
        }
        .icon-button {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
        }
        .icon-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .icon-button svg {
          width: 24px;
          height: 24px;
        }
        .instagram-btn { color: #E4405F; }
        .facebook-btn { color: #1877F2; }
        .youtube-btn { color: #FF0000; }
        .whatsapp-btn { color: #25D366; }
        .tiktok-btn { color: #000; }
        .shopify-btn { color: #96bf48; }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal {
          background: #fff;
          padding: 2rem;
          border-radius: 4px;
          position: relative;
          max-width: 90%;
          max-height: 90%;
          overflow-y: auto;
        }
        .close-btn {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          line-height: 1;
        }
        .error {
          color: #b00020;
          margin-bottom: 1rem;
        }
        .placeholder {
          font-style: italic;
          color: #555;
        }
      `}</style>
    </div>
  );
}

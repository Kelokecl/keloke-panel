import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Bot, 
  Settings, 
  Loader, 
  Save, 
  Plus, 
  Trash2, 
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Clock,
  Sparkles,
  Package,
  X
} from 'lucide-react';

export default function WhatsAppAIConfig() {
  const [config, setConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);

  useEffect(() => {
    loadAIConfig();
    loadProducts();
  }, []);

  async function loadAIConfig() {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .single();

      if (error) throw error;
      setConfig(data);
    } catch (err) {
      console.error('Error loading AI config:', err);
      setError('Error al cargar la configuración');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('whatsapp_ai_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  async function saveConfig() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('whatsapp_ai_config')
        .update({
          ...config,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (error) throw error;

      setSuccess('Configuración guardada exitosamente');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving config:', err);
      setError('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleAI() {
    const newEnabled = !config.is_enabled;
    
    try {
      const { error } = await supabase
        .from('whatsapp_ai_config')
        .update({ 
          is_enabled: newEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, is_enabled: newEnabled });
      setSuccess(`IA ${newEnabled ? 'activada' : 'desactivada'} exitosamente`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error toggling AI:', err);
      setError('Error al cambiar el estado de la IA');
    }
  }

  async function saveProduct(productData) {
    try {
      if (currentProduct) {
        // Actualizar producto existente
        const { error } = await supabase
          .from('whatsapp_ai_products')
          .update({
            ...productData,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentProduct.id);

        if (error) throw error;
      } else {
        // Crear nuevo producto
        const { error } = await supabase
          .from('whatsapp_ai_products')
          .insert(productData);

        if (error) throw error;
      }

      await loadProducts();
      setShowProductModal(false);
      setCurrentProduct(null);
      setSuccess('Producto guardado exitosamente');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving product:', err);
      setError('Error al guardar el producto');
    }
  }

  async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;

    try {
      const { error } = await supabase
        .from('whatsapp_ai_products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      await loadProducts();
      setSuccess('Producto eliminado exitosamente');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting product:', err);
      setError('Error al eliminar el producto');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-red-900 mb-2">
            Error de configuración
          </h2>
          <p className="text-red-700">
            No se pudo cargar la configuración de IA. Por favor, intenta nuevamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg shadow-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-lg">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-1">
                IA para WhatsApp
              </h1>
              <p className="text-purple-100">
                Configura tu asistente virtual inteligente
              </p>
            </div>
          </div>
          
          {/* Toggle IA */}
          <button
            onClick={toggleAI}
            className={`relative inline-flex h-12 w-24 items-center rounded-full transition-colors ${
              config.is_enabled ? 'bg-green-500' : 'bg-gray-400'
            }`}
          >
            <span
              className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-lg transition-transform ${
                config.is_enabled ? 'translate-x-12' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-5 h-5 text-red-500" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-5 h-5 text-green-500" />
          </button>
        </div>
      )}

      {/* Estado de la IA */}
      <div className={`mb-6 p-6 rounded-lg border-2 ${
        config.is_enabled 
          ? 'bg-green-50 border-green-200' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-3 h-3 rounded-full ${
            config.is_enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}></div>
          <span className={`font-semibold ${
            config.is_enabled ? 'text-green-900' : 'text-gray-600'
          }`}>
            {config.is_enabled ? '✓ IA Activa' : '○ IA Desactivada'}
          </span>
        </div>
        <p className={`text-sm ${
          config.is_enabled ? 'text-green-700' : 'text-gray-500'
        }`}>
          {config.is_enabled 
            ? 'La IA está respondiendo automáticamente a los mensajes de WhatsApp'
            : 'Activa la IA para comenzar a responder automáticamente'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Configuración General */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Configuración General
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la IA
              </label>
              <input
                type="text"
                value={config.ai_name}
                onChange={(e) => setConfig({ ...config, ai_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Asistente Virtual"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tono de respuesta
              </label>
              <select
                value={config.response_tone}
                onChange={(e) => setConfig({ ...config, response_tone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="professional">Profesional</option>
                <option value="friendly">Amigable</option>
                <option value="casual">Casual</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.always_active}
                  onChange={(e) => setConfig({ ...config, always_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Responder siempre (incluso en horario laboral)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Horarios */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Horarios de Atención
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora de inicio
              </label>
              <input
                type="time"
                value={config.working_hours_start}
                onChange={(e) => setConfig({ ...config, working_hours_start: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora de término
              </label>
              <input
                type="time"
                value={config.working_hours_end}
                onChange={(e) => setConfig({ ...config, working_hours_end: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.auto_reply_outside_hours}
                  onChange={(e) => setConfig({ ...config, auto_reply_outside_hours: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Responder automáticamente fuera de horario
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Mensajes */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Mensajes de la IA
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mensaje de saludo
            </label>
            <textarea
              value={config.greeting_message}
              onChange={(e) => setConfig({ ...config, greeting_message: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Ej: ¡Hola! Soy tu asistente virtual..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción del negocio
            </label>
            <textarea
              value={config.business_description || ''}
              onChange={(e) => setConfig({ ...config, business_description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Describe tu negocio para que la IA pueda responder mejor..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mensaje fuera de horario
            </label>
            <textarea
              value={config.outside_hours_message}
              onChange={(e) => setConfig({ ...config, outside_hours_message: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Mensaje cuando contacten fuera del horario..."
            />
          </div>
        </div>
      </div>

      {/* Productos para entrenamiento */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Productos y Servicios
            </h2>
          </div>
          <button
            onClick={() => {
              setCurrentProduct(null);
              setShowProductModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar Producto
          </button>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No hay productos configurados</p>
            <p className="text-sm text-gray-400">
              Agrega productos para que la IA pueda venderlos
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{product.product_name}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCurrentProduct(product);
                        setShowProductModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{product.product_description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-600">{product.price}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    product.is_active 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {product.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botón Guardar */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Guardar Configuración
            </>
          )}
        </button>
      </div>

      {/* Modal de Producto */}
      {showProductModal && (
        <ProductModal
          product={currentProduct}
          onSave={saveProduct}
          onClose={() => {
            setShowProductModal(false);
            setCurrentProduct(null);
          }}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onSave, onClose }) {
  const [formData, setFormData] = useState(product || {
    product_name: '',
    product_description: '',
    price: '',
    category: '',
    features: [],
    sales_pitch: '',
    stock_status: 'available',
    is_active: true
  });

  const [featureInput, setFeatureInput] = useState('');

  function addFeature() {
    if (featureInput.trim()) {
      setFormData({
        ...formData,
        features: [...(formData.features || []), featureInput.trim()]
      });
      setFeatureInput('');
    }
  }

  function removeFeature(index) {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index)
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">
            {product ? 'Editar Producto' : 'Nuevo Producto'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del producto *
            </label>
            <input
              type="text"
              value={formData.product_name}
              onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ej: Automatización de WhatsApp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción *
            </label>
            <textarea
              value={formData.product_description}
              onChange={(e) => setFormData({ ...formData, product_description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Describe el producto..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio
              </label>
              <input
                type="text"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: $99.990 CLP"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoría
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Automatización"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Características
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addFeature()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Agrega una característica..."
              />
              <button
                onClick={addFeature}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {(formData.features || []).map((feature, index) => (
                <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                  <span className="flex-1 text-sm text-gray-700">{feature}</span>
                  <button
                    onClick={() => removeFeature(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pitch de ventas
            </label>
            <textarea
              value={formData.sales_pitch}
              onChange={(e) => setFormData({ ...formData, sales_pitch: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Mensaje de venta específico para este producto..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado de stock
              </label>
              <select
                value={formData.stock_status}
                onChange={(e) => setFormData({ ...formData, stock_status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="available">Disponible</option>
                <option value="limited">Stock limitado</option>
                <option value="out_of_stock">Sin stock</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Producto activo</span>
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(formData)}
            disabled={!formData.product_name || !formData.product_description}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Guardar Producto
          </button>
        </div>
      </div>
    </div>
  );
}

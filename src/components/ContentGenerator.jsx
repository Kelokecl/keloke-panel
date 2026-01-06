// Este es el archivo corregido y completo de ContentGenerator.jsx adaptado para trabajar con Supabase y Vercel.
// Se mantiene la estructura original del proyecto y se conecta correctamente a la función edge generate-content

import React, { useState } from 'react'

export default function ContentGenerator() {
  const [formData, setFormData] = useState({
    product_name: '',
    product_price: '',
    strategy: '',
    tone: '',
    campaign_type: 'organic',
    platform: 'Instagram',
    ab_variant: '',
    age_range: '',
    interests: ''
  })

  const [generatedContent, setGeneratedContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setGeneratedContent(null)

    try {
      const response = await fetch('/api/generate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) throw new Error('Error generando contenido')

      const data = await response.json()
      setGeneratedContent(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(generatedContent, null, 2))
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Generador de Contenido</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" name="product_name" placeholder="Nombre del producto" value={formData.product_name} onChange={handleChange} className="w-full p-2 border" />
        <input type="text" name="product_price" placeholder="Precio del producto" value={formData.product_price} onChange={handleChange} className="w-full p-2 border" />
        <input type="text" name="strategy" placeholder="Estrategia" value={formData.strategy} onChange={handleChange} className="w-full p-2 border" />
        <input type="text" name="tone" placeholder="Tono" value={formData.tone} onChange={handleChange} className="w-full p-2 border" />
        <select name="campaign_type" value={formData.campaign_type} onChange={handleChange} className="w-full p-2 border">
          <option value="organic">Orgánica</option>
          <option value="paid">Pagada</option>
        </select>
        <input type="text" name="platform" placeholder="Plataforma" value={formData.platform} onChange={handleChange} className="w-full p-2 border" />
        {formData.campaign_type === 'paid' && (
          <>
            <input type="text" name="ab_variant" placeholder="Variante A/B" value={formData.ab_variant} onChange={handleChange} className="w-full p-2 border" />
            <input type="text" name="age_range" placeholder="Rango de edad" value={formData.age_range} onChange={handleChange} className="w-full p-2 border" />
            <input type="text" name="interests" placeholder="Intereses" value={formData.interests} onChange={handleChange} className="w-full p-2 border" />
          </>
        )}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Generar</button>
      </form>

      {loading && <p className="mt-4">Generando contenido...</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}

      {generatedContent && (
        <div className="mt-6 p-4 border rounded bg-gray-100">
          <h2 className="text-xl font-semibold mb-2">Contenido Generado</h2>
          <pre className="whitespace-pre-wrap break-words text-sm bg-white p-2 rounded border">
            {JSON.stringify(generatedContent, null, 2)}
          </pre>
          <div className="mt-2 flex space-x-2">
            <button onClick={handleCopy} className="px-3 py-1 bg-green-600 text-white rounded">Copiar</button>
            <button className="px-3 py-1 bg-yellow-600 text-white rounded">Guardar</button>
            <button className="px-3 py-1 bg-purple-600 text-white rounded">Preview</button>
            <button className="px-3 py-1 bg-blue-700 text-white rounded">Publicar</button>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState } from "react";
import axios from "axios";

const ContentGenerator = () => {
  const [formData, setFormData] = useState({
    product_name: "",
    product_price: "",
    strategy: "",
    tone: "",
    campaign_type: "organic",
    platform: "Instagram",
    ab_variant: "A",
    age_range: "18-24",
    interests: ""
  });

  const [generatedContent, setGeneratedContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        "https://ggqsgkaeopvbsultjgvt.supabase.co/functions/v1/generate-content",
        formData,
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      setGeneratedContent(response.data);
    } catch (err) {
      console.error("Error generating content:", err);
      setError("Hubo un error generando el contenido");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handlePublish = (platform) => {
    alert(`Simulando publicación en ${platform}. Esta función aún está en desarrollo.`);
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Generador de Contenido</h1>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <input name="product_name" placeholder="Nombre del producto" onChange={handleChange} required className="border p-2 rounded" />
        <input name="product_price" placeholder="Precio del producto" onChange={handleChange} required className="border p-2 rounded" />
        <input name="strategy" placeholder="Estrategia" onChange={handleChange} className="border p-2 rounded" />
        <input name="tone" placeholder="Tono del mensaje" onChange={handleChange} className="border p-2 rounded" />
        <select name="campaign_type" onChange={handleChange} className="border p-2 rounded">
          <option value="organic">Orgánica</option>
          <option value="paid">Pagada</option>
        </select>
        <select name="platform" onChange={handleChange} className="border p-2 rounded">
          <option value="Instagram">Instagram</option>
          <option value="Facebook">Facebook</option>
          <option value="YouTube">YouTube</option>
          <option value="Shopify">Shopify</option>
        </select>
        {formData.campaign_type === "paid" && (
          <>
            <input name="ab_variant" placeholder="Variante A/B" onChange={handleChange} className="border p-2 rounded" />
            <input name="age_range" placeholder="Rango de edad" onChange={handleChange} className="border p-2 rounded" />
            <input name="interests" placeholder="Intereses" onChange={handleChange} className="border p-2 rounded" />
          </>
        )}
        <button type="submit" className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          {loading ? "Generando..." : "Generar Contenido"}
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {generatedContent && (
        <div className="mt-6 bg-gray-100 p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Contenido Generado</h2>
          <pre className="whitespace-pre-wrap">{JSON.stringify(generatedContent, null, 2)}</pre>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => copyToClipboard(JSON.stringify(generatedContent, null, 2))}
              className="bg-gray-700 text-white px-3 py-1 rounded hover:bg-gray-800"
            >
              Copiar
            </button>
            <button
              onClick={() => handlePublish(formData.platform)}
              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            >
              Publicar en {formData.platform}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentGenerator;

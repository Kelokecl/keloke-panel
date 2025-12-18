// Configuración de Shopify Admin API utilizando variables de entorno de Vite
// Define en tu .env.local:
// VITE_SHOPIFY_STORE_URL=https://TU_TIENDA.myshopify.com
// VITE_SHOPIFY_ACCESS_TOKEN=shpat_xxx
// VITE_SHOPIFY_API_VERSION=2025-10
const SHOPIFY_STORE_URL = import.meta.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = import.meta.env.VITE_SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = import.meta.env.VITE_SHOPIFY_API_VERSION || '2025-10';

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.warn('⚠️ Shopify no está configurado correctamente. Revisa VITE_SHOPIFY_STORE_URL y VITE_SHOPIFY_ACCESS_TOKEN en tu .env.local');
}

// Cliente Shopify
export const shopifyClient = {
  async request(query, variables = {}) {
    const response = await fetch(`${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error en Shopify API:', response.status, errorText);
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('❌ Errores en respuesta de Shopify:', result.errors);
      throw new Error('Shopify GraphQL error');
    }

    return result.data;
  },

  // Obtener información básica de la tienda
  async getShopInfo() {
    const query = `
      query {
        shop {
          id
          name
          email
          currencyCode
          primaryDomain {
            url
          }
        }
      }
    `;

    return this.request(query);
  },
};

export default shopifyClient;

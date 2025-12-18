# Supabase Edge Functions

## Shopify Analytics Function

This Edge Function fetches real-time data from your Shopify store and provides it to the frontend without CORS issues.

### Setup & Deployment

1. **Install Supabase CLI** (if not already installed):

```bash
npm install -g supabase
```

2. **Login to Supabase**:

```bash
supabase login
```

3. **Link your project**:

```bash
supabase link --project-ref nffeqekvvqsqwbjrmkjs
```

4. **Deploy the function**:

```bash
supabase functions deploy shopify-analytics
```

### Testing the Function

Once deployed, you can test it:

```bash
curl -i --location --request GET 'https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/shopify-analytics' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY'
```

### What It Does

The function:

- ✅ Fetches products from Shopify Admin API
- ✅ Fetches recent orders and customer data
- ✅ Fetches shop information
- ✅ Calculates key metrics (revenue, average order value, etc.)
- ✅ Identifies low stock items
- ✅ Provides AI-generated insights
- ✅ Returns all data in a structured format for the frontend

### Response Format

```json
{
  "storeName": "Your Store",
  "storeUrl": "csn703-10.myshopify.com",
  "totalProducts": 50,
  "activeProducts": 45,
  "totalOrders": 1250,
  "totalRevenue": 18500000,
  "averageOrderValue": 68000,
  "topProducts": [...],
  "recentOrders": [...],
  "lowStock": [...],
  "weeklyRevenue": [...],
  "insights": [...]
}
```

### Security

- The function runs server-side, so your Shopify API credentials are never exposed to the frontend
- Only authenticated users can call this function (requires valid Supabase auth token)
- CORS is properly configured to allow requests from your frontend

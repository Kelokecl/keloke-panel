#!/bin/bash

echo "🚀 Deploying Supabase Edge Functions..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null
then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

echo "📦 Deploying shopify-analytics function..."
supabase functions deploy shopify-analytics

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your function is now available at:"
echo "https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/shopify-analytics"
echo ""
echo "Test it with:"
echo "curl -i --location --request GET 'https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/shopify-analytics' \\"
echo "  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY'"


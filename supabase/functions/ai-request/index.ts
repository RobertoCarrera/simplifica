import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.14.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Validate JWT (Secure the endpoint)
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            throw new Error('Unauthorized');
        }

        // 2. Get Input
        const { task, prompt, images, model } = await req.json()
        const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY is not set')
        }

        // 3. Initialize Gemini (Explicitly using v1beta often helps with newer models on this SDK, but 1.5-flash is stable on v1 if using latest SDK. 
        // Note: For now, standard initialization defaults to what the SDK considers stable.)
        const genAI = new GoogleGenerativeAI(apiKey);

        // Use user requested model or default to gemini-2.5-flash-lite
        const targetModel = model || 'gemini-2.5-flash-lite';

        // Configure model
        const generationConfig = {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096,
        };

        const aiModel = genAI.getGenerativeModel({ model: targetModel, generationConfig });

        // 4. Construct Content Parts
        let parts: any[] = [];
        if (prompt) {
            parts.push({ text: prompt });
        }

        if (images && Array.isArray(images)) {
            // images expected to be base64 strings without data:image/xxx;base64, prefix if possible, 
            // or we strip it.
            for (const img of images) {
                // Extract base64 and mime type. Support images, audio, and video.
                const match = img.match(/^data:((?:image|audio|video)\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
                let mimeType = 'image/jpeg'; // Default fallback, though unlikely to work for audio if unmatched
                let data = img;

                if (match) {
                    mimeType = match[1];
                    data = match[2];
                }

                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: data
                    }
                });
            }
        }

        // 5. Generate Content
        const result = await aiModel.generateContent(parts);
        const response = await result.response;
        const text = response.text();

        return new Response(
            JSON.stringify({ result: text }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})

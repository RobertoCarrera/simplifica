import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.14.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const optionsResponse = handleCorsOptions(req);
    if (optionsResponse) return optionsResponse;

    try {
        // 1. Validate JWT (actually verify the token, not just check header presence)
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }
        
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        // 2. Get Input
        const { task, prompt, images, model } = await req.json()
        const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY is not set')
        }

        // Validate model against allowlist
        const ALLOWED_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        const targetModel = ALLOWED_MODELS.includes(model) ? model : 'gemini-2.5-flash-lite';

        // Validate images limits
        const MAX_IMAGES = 5;
        const MAX_BASE64_LENGTH = 10 * 1024 * 1024; // ~10MB per image
        if (images && Array.isArray(images)) {
            if (images.length > MAX_IMAGES) {
                return new Response(
                    JSON.stringify({ error: `Maximum ${MAX_IMAGES} images allowed` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }
            for (const img of images) {
                if (typeof img !== 'string' || img.length > MAX_BASE64_LENGTH) {
                    return new Response(
                        JSON.stringify({ error: 'Image too large or invalid' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                    )
                }
            }
        }

        // 3. Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);

        // Configure model
        const generationConfig = {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096,
        };

        const aiModel = genAI.getGenerativeModel({ model: targetModel, generationConfig });

        // 4. Construct Content Parts
        const parts: any[] = [];
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
            JSON.stringify({ error: 'Internal server error' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})

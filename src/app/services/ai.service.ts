
import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface ScanDeviceResult {
    brand?: string;
    model?: string;
    device_type?: string; // 'smartphone', 'tablet', 'laptop', 'console', 'other'
    color?: string;
    serial_number?: string;
    imei?: string;
    condition?: string; // summary of physical condition
    reported_issue_inference?: string; // inferred issue from visual damage
}

@Injectable({
    providedIn: 'root'
})
export class AiService {
    private supabase: SupabaseClient;

    constructor(private sbClient: SupabaseClientService) {
        this.supabase = this.sbClient.instance;
    }

    /**
     * Generic method to generate content using Gemini
     * @param prompt Text prompt
     * @param images Base64 strings of images (optional)
     * @param model Model name (optional, defaults to 'gemini-1.5-flash' in backend)
     */
    async generateContent(prompt: string, images?: string[], model: string = 'gemini-2.5-flash-lite'): Promise<string> {
        try {
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) throw new Error('No active session');

            const base = (environment as any).edgeFunctionsBaseUrl || '';
            const funcUrl = base.replace(/\/+$/, '') + '/ai-request';

            const response = await fetch(funcUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt,
                    images,
                    model
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'AI Request failed');
            }

            const json = await response.json();
            return json.result;
        } catch (error) {
            console.error('AI Service Error:', error);
            throw error;
        }
    }

    /**
     * Log AI usage for analytics
     */
    private async logUsage(featureKey: string, savedSeconds: number) {
        try {
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) return; // Silent fail if no session

            const { error } = await this.supabase
                .from('ai_usage_logs')
                .insert({
                    company_id: (session.user as any).user_metadata?.company_id || (await this.getCompanyId(session.user.id)),
                    user_id: session.user.id,
                    feature_key: featureKey,
                    saved_seconds: savedSeconds
                });

            if (error) console.error('Error logging AI usage', error);
        } catch (e) {
            console.error('Error in logUsage', e);
        }
    }

    private async getCompanyId(userId: string): Promise<string | null> {
        // 1. Try 'users' table (staff)
        const { data: userData, error: userError } = await this.supabase
            .from('users')
            .select('company_id')
            .eq('id', userId)
            .maybeSingle();

        if (userData?.company_id) return userData.company_id;

        // 2. Try 'clients' table (end users)
        const { data: clientData } = await this.supabase
            .from('clients')
            .select('company_id')
            .eq('auth_user_id', userId)
            .maybeSingle();

        return clientData?.company_id || null;
    }

    /**
     * Specialized method to scan a device image and return structured data.
     * Uses Gemini Vision capabilities.
     */
    async scanDevice(imageFile: File): Promise<ScanDeviceResult> {
        const base64Image = await this.fileToBase64(imageFile);

        const prompt = `
      Analiza esta imagen de un dispositivo.
      Actúa como un técnico profesional.
      Extrae la siguiente información en formato JSON estricto (no incluyas formato markdown como \`\`\`json):
      {
        "brand": "Marca si es visible (ej. Apple, Samsung, Dell)",
        "model": "Modelo si es visible o identificable",
        "device_type": "Uno de: 'smartphone', 'tablet', 'laptop', 'console', 'smartwatch', 'other'",
        "color": "Color del dispositivo (en español)",
        "serial_number": "Número de serie si es visible",
        "imei": "IMEI si es visible",
        "condition": "Breve descripción de la condición física (arañazos, grietas, impoluto) EN ESPAÑOL",
        "reported_issue_inference": "Si ves daños obvios (pantalla rota, batería hinchada), descríbelo EN ESPAÑOL. Si no, null."
      }
      Si un campo no es visible, usa null.
      ASEGURATE DE QUE TODOS LOS VALORES DE TEXTO ESTÉN EN ESPAÑOL.
    `;

        const resultText = await this.generateContent(prompt, [base64Image], 'gemini-2.5-flash-lite');

        try {
            // Clean up markdown code blocks if the model adds them despite instructions
            const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();

            // Log analytics (Estimate: 3 mins saved)
            this.logUsage('scan_device', 180);

            return JSON.parse(cleanJson) as ScanDeviceResult;
        } catch (e) {
            console.error('Failed to parse AI response:', resultText);
            throw new Error('Could not parse device info from AI response');
        }
    }

    private fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    }

    /**
     * Process audio input to generate ticket details.
     * @param audioBlob The recorded audio blob (webm/mp3/wav)
     * @returns Structured ticket data (type, title, description)
     */
    async processAudioTicket(audioBlob: Blob): Promise<{ type: 'incidence' | 'request' | 'question', title: string, description: string }> {
        // 1. Convert Blob to Base64
        const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = err => reject(err);
        });

        // 2. Prompt for Gemini
        const prompt = `
        Eres un asistente de soporte técnico. Analiza esta grabación de audio de un cliente.
        IMPORTANTE: EL RESULTADO DEBE SER SIEMPRE EN ESPAÑOL, incluso si el audio es en otro idioma.
        
        Tarea:
        1. Categoriza el problema en uno de estos tipos:
           - 'incidence' (algo roto, error, fallo, bug)
           - 'request' (nueva funcionalidad, nuevo servicio, instalación)
           - 'question' (duda general, consulta, cómo se hace)
        
        2. Extrae un Título corto y claro (máx 6 palabras) EN ESPAÑOL.
        3. Extrae una Descripción detallada del audio EN ESPAÑOL.
        
        Devuelve SOLO JSON válido:
        {
          "type": "incidence" | "request" | "question",
          "title": "Título corto en Español",
          "description": "Descripción completa en Español"
        }
      `;

        // 3. Send to AI
        const resultText = await this.generateContent(prompt, [base64Audio], 'gemini-2.5-flash-lite');

        try {
            const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanJson);

            // Validate type fallback
            const validTypes = ['incidence', 'request', 'question'];
            if (!validTypes.includes(data.type)) {
                data.type = 'question'; // default fallback
            }

            // Log analytics (Estimate: 4 mins saved)
            this.logUsage('audio_ticket', 240);

            return data;
        } catch (e) {
            console.error('Failed to parse Audio AI response:', resultText);
            throw new Error('Could not understand audio request');
        }
    }

    /**
     * Process audio input to generate CLIENT details.
     * @param audioBlob The recorded audio blob
     * @returns Structured client data
     */
    async processAudioClient(audioBlob: Blob): Promise<{
        client_type: 'individual' | 'business',
        name?: string,
        apellidos?: string,
        business_name?: string,
        email?: string,
        phone?: string,
        dni?: string,
        cif_nif?: string,
        addressNombre?: string,
        addressNumero?: string,
        addressLocalidad?: string,
        addressProvincia?: string
    }> {
        // 1. Convert Blob to Base64
        const base64Audio = await this.fileToBase64(new File([audioBlob], 'audio.webm'));

        // 2. Prompt for Gemini
        const prompt = `
        Eres un asistente administrativo. Analiza esta grabación de audio donde se dictan datos de un nuevo cliente.
        IMPORTANTE: Extrae la máxima cantidad de información posible. Si deletrean algo, úsalo con prioridad.
        
        Campos a extraer (JSON):
        {
          "client_type": "individual" (persona normal) o "business" (empresa/autónomo con nombre comercial),
          "name": "Nombre de pila (si es persona)",
          "apellidos": "Apellidos (si es persona)",
          "business_name": "Razón social o Nombre comercial (si es empresa)",
          "email": "Correo electrónico (intenta corregir fonéticamente, ej 'arroba' -> @, 'punto' -> .)",
          "phone": "Teléfono (formato sin espacios)",
          "dni": "DNI/NIE si se menciona",
          "cif_nif": "CIF/NIF si es empresa",
          "addressNombre": "Nombre de la calle/vía",
          "addressNumero": "Número de la calle",
          "addressLocalidad": "Ciudad/Pueblo",
          "addressProvincia": "Provincia"
        }

        Si un campo no se menciona, usa null.
        Para el email, si dicen "juan punto perez arroba gmail punto com", conviértelo a "juan.perez@gmail.com".
        Devuelve SOLO el JSON.
      `;

        // 3. Send to AI
        const resultText = await this.generateContent(prompt, [base64Audio], 'gemini-2.5-flash-lite');

        try {
            const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanJson);

            // Basic normalization
            if (data.client_type !== 'business') data.client_type = 'individual';

            // Log analytics (Estimate: 4 mins saved)
            this.logUsage('audio_client', 240);

            return data;
        } catch (e) {
            console.error('Failed to parse Client Audio AI response:', resultText);
            throw new Error('No se pudieron extraer datos del cliente del audio.');
        }
    }

    async processAudioQuote(audioBlob: Blob): Promise<{
        client_name: string,
        items: Array<{ description: string, quantity: number, price: number }>
    }> {
        const base64Audio = await this.fileToBase64(new File([audioBlob], 'audio.webm'));

        const prompt = `
        Eres un asistente administrativo. Analiza esta grabación donde se describe un presupuesto.
        Extrae:
        1. El nombre del cliente (persona o empresa).
        2. Los items del presupuesto (descripción, cantidad, precio unitario).

        Devuelve SOLO JSON:
        {
          "client_name": "Nombre completo detectado",
          "items": [
            { "description": "Descripción del producto/servicio", "quantity": 1, "price": 0 }
          ]
        }
        
        Notas:
        - Si no mencionan cantidad, asume 1.
        - Si no mencionan precio, pon 0.
        - Intenta deducir el nombre del cliente lo mejor posible.
        `;

        const resultText = await this.generateContent(prompt, [base64Audio], 'gemini-2.5-flash-lite');

        try {
            const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();

            // Log analytics (Estimate: 8 mins saved)
            this.logUsage('audio_quote', 480);

            return JSON.parse(cleanJson);
        } catch (e) {
            console.error('Failed to parse Quote Audio AI response:', resultText);
            throw new Error('No se pudieron extraer datos del presupuesto.');
        }
    }
}

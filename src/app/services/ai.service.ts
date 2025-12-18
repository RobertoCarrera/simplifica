
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
    async generateContent(prompt: string, images?: string[], model: string = 'gemini-1.5-flash'): Promise<string> {
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
     * Specialized method to scan a device image and return structured data.
     * Uses Gemini Vision capabilities.
     */
    async scanDevice(imageFile: File): Promise<ScanDeviceResult> {
        const base64Image = await this.fileToBase64(imageFile);

        const prompt = `
      Analyze this image of a device.
      Act as a professional technician.
      Extract the following information in strict JSON format (do not include markdown formatting like \`\`\`json):
      {
        "brand": "Brand name if visible (e.g. Apple, Samsung, Dell)",
        "model": "Model name/number if visible or identifiable",
        "device_type": "One of: 'smartphone', 'tablet', 'laptop', 'console', 'smartwatch', 'other'",
        "color": "Device color",
        "serial_number": "Serial number if visible on screen or label",
        "imei": "IMEI if visible on screen or label",
        "condition": "Brief description of physical condition (scratches, cracks, pristine)",
        "reported_issue_inference": "If you see obvious damage (cracked screen, swollen battery), describe it. Otherwise null."
      }
      If a field is not visible, use null.
    `;

        const resultText = await this.generateContent(prompt, [base64Image], 'gemini-1.5-flash');

        try {
            // Clean up markdown code blocks if the model adds them despite instructions
            const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
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
}

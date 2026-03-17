
import { HfInference } from '@huggingface/inference';

export interface HFConfig {
    apiKey: string;
    model: string;
    temperature?: number;
}

export const extractDocumentData = async (
    file: File,
    config: HFConfig
): Promise<string> => {
    try {
        const hf = new HfInference(config.apiKey);

        // 1. Convert file to base64
        const base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        // 2. Make API call using chatCompletion (standard for vision models)
        const response = await hf.chatCompletion({
            model: config.model,
            messages: [
                {
                    role: "system",
                    content: `You are an expert medical document analyzer. Extract structured JSON data.
          Schema:
          {
            "patientName": string | null,
            "admissionDate": string | null (YYYY-MM-DD),
            "dischargeDate": string | null (YYYY-MM-DD),
            "diagnosis": string | null,
            "icd10Code": string | null,
            "pcsCode": string | null,
            "procedures": string[],
            "doctorName": string | null,
            "hospitalName": string | null,
            "totalAmount": number | null,
            "handwrittenNotes": string | null,
            "completenessErrors": string[],
            "mciCompliant": boolean,
            "confidence": number (0-1)
          }
          Return ONLY JSON.`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        },
                        {
                            type: "text",
                            text: "Extract data from this document."
                        }
                    ]
                }
            ],
            max_tokens: 4096,
            temperature: config.temperature || 0.1,
            response_format: { type: "json_object" }
        });

        return response.choices[0].message.content || "";

    } catch (error) {
        console.error("HF Inference API Error:", error);
        throw error;
    }
};

import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000',
    withCredentials: true,
    headers: {
        'Accept': 'application/json',
    },
});

// Response Interceptor for Token Refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If the error status is 401 and there is no originalRequest._retry flag,
        // it means the token has expired and we need to refresh it
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Request backend to refresh token via cookie
                await axios.post('http://localhost:8000/auth/refresh', {}, { withCredentials: true });

                // If successful, the browser now has the new access_token cookie
                // Retry original request
                return api(originalRequest);

            } catch (refreshError) {
                // If refresh fails, clear user state and redirect to login
                localStorage.removeItem('user');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export interface ClaimListItem {
    id: number;
    status: string;
    patient_name: string | null;
    policy_number: string | null;
    created_at: string;
    updated_at: string;
    document_count: number;
    fraud_risk_score: number | null;
    fraud_flags: string[] | null;
    reviewer_decision: string | null;
    reviewer_comments: string | null;
    reviewed_at: string | null;
}

export interface ClaimStatusResponse {
    id: number;
    status: string;
    patient_name: string | null;
    policy_number: string | null;
    created_at: string;
    updated_at: string;
    document_count: number;
    ocr_completed: number;
    fraud_risk_score: number | null;
    fraud_flags: string[] | null;
    reviewer_decision: string | null;
    reviewer_comments: string | null;
    reviewed_at: string | null;
}

export interface DocumentResponse {
    id: number;
    doc_type: string;
    original_filename: string;
    mime_type: string | null;
    ocr_status: string;
    raw_text: string | null;
}

export interface ExtractedFieldResponse {
    id: number;
    field_category: string;
    field_name: string;
    field_value: string | null;
    confidence: number | null;
    is_manually_corrected: boolean;
}

export interface ValidationResponse {
    id: number;
    status: string;
    missing_docs: string[] | null;
    warnings: string[] | null;
    errors: string[] | null;
    overall_confidence: number | null;
    created_at: string;
    irdai_checklist: Record<string, boolean> | null;
    code_validation: Record<string, { valid: boolean | null; code: string | null; message: string; description?: string }> | null;
}

export interface FraudAlertResponse {
    id: number;
    rule_triggered: string;
    risk_score: number;
    details: Record<string, any> | null;
    reviewed: boolean;
    reviewer_notes: string | null;
    created_at: string;
}

export interface ClaimDataResponse {
    claim: ClaimStatusResponse;
    documents: DocumentResponse[];
    extracted_fields: ExtractedFieldResponse[];
    fraud_alerts: FraudAlertResponse[];
    validation: ValidationResponse | null;
}

export interface UploadResponse {
    claim_id: number;
    message: string;
    documents_uploaded: number;
}

// API methods
export const claimsApi = {
    upload: async (files: File[], docTypes: string[]): Promise<UploadResponse> => {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        docTypes.forEach((dt) => formData.append('doc_types', dt));
        const { data } = await api.post('/claims/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data;
    },

    list: async (skip = 0, limit = 50): Promise<ClaimListItem[]> => {
        const { data } = await api.get('/claims', { params: { skip, limit } });
        return data;
    },

    getStatus: async (id: number): Promise<ClaimStatusResponse> => {
        const { data } = await api.get(`/claims/${id}/status`);
        return data;
    },

    getData: async (id: number): Promise<ClaimDataResponse> => {
        const { data } = await api.get(`/claims/${id}/data`);
        return data;
    },

    validate: async (id: number): Promise<ValidationResponse> => {
        const { data } = await api.post(`/claims/${id}/validate`);
        return data;
    },

    correct: async (id: number, corrections: { field_id: number; new_value: string }[]): Promise<any> => {
        const { data } = await api.put(`/claims/${id}/correct`, { corrections });
        return data;
    },

    uploadAdditional: async (claimId: number, file: File, docType: string): Promise<any> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('doc_type', docType);
        const { data } = await api.post(`/claims/${claimId}/upload-additional`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data;
    },

    submitReview: async (id: number, decision: string, comments: string): Promise<ClaimStatusResponse> => {
        const { data } = await api.post(`/claims/${id}/review`, { decision, comments });
        return data;
    },
};

export default api;

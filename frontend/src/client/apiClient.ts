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
    summary: DocumentSummaryResponse | null;
}

export interface DocumentSummaryResponse {
    id: number;
    summary_text: string;
    key_findings: string[] | null;
    document_count: number;
    created_at: string;
}

export interface ComprehendICD10Entity {
    icd10_code: string;
    description: string | null;
    score: number;
    icd10_score: number;
    text: string;
    traits: string[];
    alternatives: { code: string; description: string | null; score: number }[];
}

export interface ComprehendICD10Response {
    claim_id: number;
    entities_detected: number;
    top_icd10_codes: string[];
    entities: ComprehendICD10Entity[];
    source: string; // 'cached' | 'aws_comprehend_medical'
}

export interface UploadResponse {
    claim_id: number;
    message: string;
    documents_uploaded: number;
}

export interface UserResponse {
    id: number;
    username: string;
    role: string;
}

export const usersApi = {
    getInsurers: async (): Promise<UserResponse[]> => {
        const { data } = await api.get('/users/insurers');
        return data;
    }
};

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

    downloadDocument: async (claimId: number, docId: number, filename: string): Promise<void> => {
        const response = await api.get(`/claims/${claimId}/documents/${docId}/download`, {
            responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    submitReview: async (id: number, decision: string, comments: string): Promise<ClaimStatusResponse> => {
        const { data } = await api.post(`/claims/${id}/review`, { decision, comments });
        return data;
    },

    getSummary: async (id: number): Promise<DocumentSummaryResponse> => {
        const { data } = await api.get(`/claims/${id}/summary`);
        return data;
    },

    getPatientHistory: async (claimId: number): Promise<PatientHistoryResponse> => {
        const { data } = await api.get(`/claims/${claimId}/patient-history`);
        return data;
    },

    getComprehendICD10: async (claimId: number): Promise<ComprehendICD10Response> => {
        const { data } = await api.get(`/claims/${claimId}/comprehend`);
        return data;
    },

    linkPolicy: async (
        id: number, 
        insurerId: number, 
        policyNumber: string,
        diagnosis?: string,
        icdCode?: string,
        billAmount?: string
    ): Promise<ClaimStatusResponse> => {
        const payload: Record<string, any> = {
            insurer_id: insurerId,
            policy_number: policyNumber,
        };
        if (diagnosis) payload.diagnosis = diagnosis;
        if (icdCode) payload.icd_code = icdCode;
        if (billAmount) payload.bill_amount = billAmount;
        
        const { data } = await api.post(`/claims/${id}/link-policy`, payload);
        return data;
    },
};

export const authApi = {
    forgotPassword: async (username: string): Promise<{ message: string; reset_token?: string }> => {
        const { data } = await api.post('/auth/forgot-password', { username });
        return data;
    },
    resetPassword: async (token: string, new_password: string): Promise<{ message: string }> => {
        const { data } = await api.post('/auth/reset-password', { token, new_password });
        return data;
    },
    updatePassword: async (current_password: string, new_password: string): Promise<{ message: string }> => {
        const { data } = await api.post('/auth/update-password', { current_password, new_password });
        return data;
    }
};

export interface MonthlyStat {
    month: string;
    total: number;
    approved: number;
    rejected: number;
}

export interface PatientHistoryClaim {
    claim_id: number;
    status: string;
    diagnosis: string | null;
    total_amount: string | null;
    hospital_name: string | null;
    fraud_risk_score: number | null;
    created_at: string;
    reviewer_decision: string | null;
}

export interface PatientHistoryResponse {
    patient_name: string;
    total_past_claims: number;
    claims: PatientHistoryClaim[];
}

export interface FraudBucket {
    label: string;
    count: number;
}

export interface DocTypeStat {
    doc_type: string;
    count: number;
}

export interface RecentClaimStat {
    id: number;
    patient_name: string | null;
    status: string;
    fraud_risk_score: number | null;
    created_at: string;
}

export interface RejectionReason {
    reason: string;
    count: number;
}

export interface ClaimAnalyticsResponse {
    total_claims: number;
    processing: number;
    approved: number;
    rejected: number;
    info_requested: number;
    success_rate: number;
    avg_processing_time_hours: number;
    avg_fraud_risk_score: number;
    monthly_stats: MonthlyStat[];
    fraud_risk_distribution: FraudBucket[];
    doc_type_breakdown: DocTypeStat[];
    recent_claims: RecentClaimStat[];
    top_rejection_reasons: RejectionReason[];
}

export interface ClinicalTrend {
    label: string;
    count: number;
}

export interface HospitalTrend {
    hospital_name: string;
    count: number;
}

export interface RoleAnalyticsResponse {
    role: string;
    total_revenue_claimed: number;
    total_revenue_approved: number;
    total_fraud_savings: number | null;
    top_diagnoses: ClinicalTrend[];
    top_hospitals: HospitalTrend[] | null;
}

export const analyticsApi = {
    getAnalytics: async (): Promise<ClaimAnalyticsResponse> => {
        const { data } = await api.get('/claims/dashboard/analytics');
        return data;
    },
    getRoleAnalytics: async (): Promise<RoleAnalyticsResponse> => {
        const { data } = await api.get('/claims/dashboard/role-analytics');
        return data;
    }
};

export default api;

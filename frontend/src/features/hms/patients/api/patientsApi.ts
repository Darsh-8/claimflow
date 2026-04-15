import api from '../../hmsClient';
import type { Patient, PatientCreate, PatientJourney } from '../../types';

export const patientsApi = {
  list: async (params?: { skip?: number; limit?: number; search?: string }): Promise<Patient[]> => {
    const { data } = await api.get('/hms/patients', { params });
    return data;
  },

  get: async (id: number): Promise<Patient> => {
    const { data } = await api.get(`/hms/patients/${id}`);
    return data;
  },

  create: async (body: PatientCreate): Promise<Patient> => {
    const { data } = await api.post('/hms/patients', body);
    return data;
  },

  update: async (id: number, body: Partial<PatientCreate>): Promise<Patient> => {
    const { data } = await api.put(`/hms/patients/${id}`, body);
    return data;
  },

  deactivate: async (id: number): Promise<void> => {
    await api.delete(`/hms/patients/${id}`);
  },

  getJourney: async (id: number): Promise<PatientJourney> => {
    const { data } = await api.get(`/hms/patients/${id}/journey`);
    return data;
  },

  getDocumentBlob: async (claimId: number, docId: number): Promise<string> => {
    const response = await api.get(`/claims/${claimId}/documents/${docId}/download`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data as Blob);
  },
};

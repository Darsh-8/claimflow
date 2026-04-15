import api from '../../hmsClient';
import type { Admission, AdmissionCreate } from '../../types';

export const admissionsApi = {
  list: async (params?: { skip?: number; limit?: number; status?: string }): Promise<Admission[]> => {
    const { data } = await api.get('/hms/admissions', { params });
    return data;
  },

  get: async (id: number): Promise<Admission> => {
    const { data } = await api.get(`/hms/admissions/${id}`);
    return data;
  },

  create: async (body: AdmissionCreate): Promise<Admission> => {
    const { data } = await api.post('/hms/admissions', body);
    return data;
  },

  discharge: async (id: number, notes?: string): Promise<Admission> => {
    const { data } = await api.post(`/hms/admissions/${id}/discharge`, {
      actual_discharge: new Date().toISOString(),
      notes,
    });
    return data;
  },
};

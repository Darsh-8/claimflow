import api from '../../hmsClient';
import type { Doctor, DoctorCreate } from '../../types';

export const doctorsApi = {
  list: async (params?: { skip?: number; limit?: number; search?: string }): Promise<Doctor[]> => {
    const { data } = await api.get('/hms/doctors', { params });
    return data;
  },

  get: async (id: number): Promise<Doctor> => {
    const { data } = await api.get(`/hms/doctors/${id}`);
    return data;
  },

  create: async (body: DoctorCreate): Promise<Doctor> => {
    const { data } = await api.post('/hms/doctors', body);
    return data;
  },

  update: async (id: number, body: Partial<DoctorCreate>): Promise<Doctor> => {
    const { data } = await api.put(`/hms/doctors/${id}`, body);
    return data;
  },

  deactivate: async (id: number): Promise<void> => {
    await api.delete(`/hms/doctors/${id}`);
  },
};

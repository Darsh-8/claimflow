import api from '../../hmsClient';
import type { Appointment, AppointmentCreate } from '../../types';

export const appointmentsApi = {
  list: async (params?: { skip?: number; limit?: number; status?: string; date?: string; patient_id?: number }): Promise<Appointment[]> => {
    const { data } = await api.get('/hms/appointments', { params });
    return data;
  },

  get: async (id: number): Promise<Appointment> => {
    const { data } = await api.get(`/hms/appointments/${id}`);
    return data;
  },

  create: async (body: AppointmentCreate): Promise<Appointment> => {
    const { data } = await api.post('/hms/appointments', body);
    return data;
  },

  cancel: async (id: number): Promise<Appointment> => {
    const { data } = await api.post(`/hms/appointments/${id}/cancel`);
    return data;
  },

  complete: async (id: number): Promise<Appointment> => {
    const { data } = await api.post(`/hms/appointments/${id}/complete`);
    return data;
  },
};

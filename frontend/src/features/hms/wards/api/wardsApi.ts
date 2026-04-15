import api from '../../hmsClient';
import type { Ward, WardCreate } from '../../types';

export const wardsApi = {
  list: async (): Promise<Ward[]> => {
    const { data } = await api.get('/hms/wards');
    return data;
  },

  get: async (id: number): Promise<Ward> => {
    const { data } = await api.get(`/hms/wards/${id}`);
    return data;
  },

  create: async (body: WardCreate): Promise<Ward> => {
    const { data } = await api.post('/hms/wards', body);
    return data;
  },

  update: async (id: number, body: Partial<WardCreate>): Promise<Ward> => {
    const { data } = await api.put(`/hms/wards/${id}`, body);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/hms/wards/${id}`);
  },
};

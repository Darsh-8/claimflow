import api from '../../hmsClient';
import type { Invoice, InvoiceCreate } from '../../types';

export const billingApi = {
  list: async (params?: { skip?: number; limit?: number; patient_id?: number; status?: string }): Promise<Invoice[]> => {
    const { data } = await api.get('/hms/invoices', { params });
    return data;
  },

  get: async (id: number): Promise<Invoice> => {
    const { data } = await api.get(`/hms/invoices/${id}`);
    return data;
  },

  create: async (body: InvoiceCreate): Promise<Invoice> => {
    const { data } = await api.post('/hms/invoices', body);
    return data;
  },

  markPaid: async (id: number, payment_method?: string): Promise<Invoice> => {
    const { data } = await api.post(`/hms/invoices/${id}/pay`, { payment_method });
    return data;
  },

  cancel: async (id: number): Promise<Invoice> => {
    const { data } = await api.post(`/hms/invoices/${id}/cancel`);
    return data;
  },
};

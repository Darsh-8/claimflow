import api from '../hmsClient';

export interface WardBreakdown {
  id: number;
  name: string;
  ward_type: string;
  total_beds: number;
  available_beds: number;
  occupied_beds: number;
  occupancy_rate: number;
}

export interface MonthlyTrend {
  month: string;
  admissions: number;
  discharges: number;
}

export interface TopDiagnosis {
  diagnosis: string;
  count: number;
}

export interface HMSAnalytics {
  patients: {
    total: number;
    active: number;
    inactive: number;
    new_this_month: number;
  };
  doctors: {
    total: number;
    active: number;
  };
  wards: {
    total: number;
    total_beds: number;
    available_beds: number;
    occupied_beds: number;
    occupancy_rate: number;
    breakdown: WardBreakdown[];
  };
  admissions: {
    total: number;
    currently_admitted: number;
    discharged_this_month: number;
    monthly_trends: MonthlyTrend[];
  };
  appointments: {
    total: number;
    today: number;
    by_status: {
      scheduled: number;
      completed: number;
      cancelled: number;
      no_show: number;
    };
    by_type: {
      OPD: number;
      FOLLOW_UP: number;
      EMERGENCY: number;
    };
  };
  billing: {
    total_invoices: number;
    total_billed: number;
    total_collected: number;
    pending_amount: number;
    paid_count: number;
    pending_count: number;
    partial_count: number;
  };
  top_diagnoses: TopDiagnosis[];
}

export const hmsAnalyticsApi = {
  get: async (): Promise<HMSAnalytics> => {
    const { data } = await api.get('/hms/analytics');
    return data;
  },
};

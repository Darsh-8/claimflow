import { useState, useEffect, useCallback } from 'react';
import { patientsApi } from '../api/patientsApi';
import type { Patient } from '../../types';

export function usePatients() {
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearchRaw] = useState('');

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await patientsApi.list();
      setAllPatients(data);
    } catch {
      setError('Failed to load patients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  useEffect(() => {
    if (!search.trim()) {
      setPatients(allPatients);
      return;
    }
    const q = search.toLowerCase();
    setPatients(
      allPatients.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
      )
    );
  }, [allPatients, search]);

  const setSearch = (s: string) => setSearchRaw(s);

  return { patients, loading, error, refetch: fetchPatients, search, setSearch };
}

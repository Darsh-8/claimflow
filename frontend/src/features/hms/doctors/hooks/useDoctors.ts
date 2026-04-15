import { useState, useEffect, useCallback } from 'react';
import { doctorsApi } from '../api/doctorsApi';
import type { Doctor } from '../../types';

export function useDoctors() {
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearchRaw] = useState('');

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await doctorsApi.list();
      setAllDoctors(data);
    } catch {
      setError('Failed to load doctors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDoctors(); }, [fetchDoctors]);

  useEffect(() => {
    if (!search.trim()) {
      setDoctors(allDoctors);
      return;
    }
    const q = search.toLowerCase();
    setDoctors(
      allDoctors.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.specialization?.toLowerCase().includes(q) ||
        d.department?.toLowerCase().includes(q)
      )
    );
  }, [allDoctors, search]);

  const setSearch = (s: string) => setSearchRaw(s);

  return { doctors, loading, error, refetch: fetchDoctors, search, setSearch };
}

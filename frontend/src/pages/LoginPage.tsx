import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, HeartPulse, Building2 } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            // OAuth2 requires form-urlencoded format
            const response = await axios.post('http://localhost:8000/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                withCredentials: true
            });

            login(response.data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to login. Please check credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', padding: '20px' }}>
            <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '40px 32px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <ShieldCheck size={24} />
                        </div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 }}>
                            ClaimFlow
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Automated Medical Adjudication Engine</p>
                </div>

                {error && (
                    <div style={{ background: 'var(--error-bg)', color: 'var(--error)', padding: '12px', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '20px', border: '1px solid #fca5a5' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem' }}
                            required
                        />
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Password</label>
                            <a href="/forgot-password" style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
                                Forgot Password?
                            </a>
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem' }}
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>

                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px', letterSpacing: '0.5px' }}>Test Credentials</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                            <HeartPulse size={16} color="var(--accent-blue)" />
                            <div><strong>Hospital Role:</strong> demo_hospital / password123</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                            <Building2 size={16} color="var(--purple)" />
                            <div><strong>Insurer Role:</strong> demo_insurer / password123</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

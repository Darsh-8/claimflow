import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { authApi } from '../client/apiClient';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const tokenParam = searchParams.get('token') || '';
    
    const [token, setToken] = useState(tokenParam);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMessage('');

        if (password !== confirmPassword) {
            setStatus('error');
            setMessage('Passwords do not match');
            return;
        }

        try {
            const res = await authApi.resetPassword(token, password);
            setStatus('success');
            setMessage(res.message);
        } catch (err: any) {
            setStatus('error');
            setMessage(err.response?.data?.detail || 'Failed to update password. Token may be invalid or expired.');
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
                            Create New Password
                        </h1>
                    </div>
                </div>

                {status === 'error' && (
                    <div style={{ background: 'var(--error-bg)', color: 'var(--error)', padding: '12px', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '20px', border: '1px solid #fca5a5' }}>
                        {message}
                    </div>
                )}
                
                {status === 'success' ? (
                     <div style={{ textAlign: 'center' }}>
                         <div style={{ background: '#dcfce7', color: '#166534', padding: '16px', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '24px', border: '1px solid #bbf7d0' }}>
                            {message}
                         </div>
                         <Link to="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', textDecoration: 'none', display: 'flex', gap: '8px' }}>
                            Proceed to Login <ArrowRight size={18} />
                        </Link>
                     </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {!tokenParam && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Reset Token</label>
                                <input
                                    type="text"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="Paste your reset token here"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', fontFamily: 'monospace' }}
                                    required
                                />
                            </div>
                        )}
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>New Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem' }}
                                required
                            />
                        </div>
                        
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Confirm New Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem' }}
                                required
                            />
                        </div>
                        
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={status === 'loading' || !token}>
                            {status === 'loading' ? 'Saving...' : 'Save Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

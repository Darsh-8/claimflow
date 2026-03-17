import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { authApi } from '../client/apiClient';

export default function ForgotPasswordPage() {
    const [username, setUsername] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [tokenSnippet, setTokenSnippet] = useState(''); // Only for MVP demo purpose

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMessage('');

        try {
            const res = await authApi.forgotPassword(username);
            setStatus('success');
            setMessage(res.message);
            if (res.reset_token) setTokenSnippet(res.reset_token);
        } catch (err: any) {
            setStatus('error');
            setMessage(err.response?.data?.detail || 'Failed to process request. Please try again.');
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
                            Account Recovery
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
                            
                            {tokenSnippet && (
                                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #bbf7d0', textAlign: 'left', wordBreak: 'break-all' }}>
                                    <strong style={{ display: 'block', marginBottom: '8px' }}>MVP Testing Token:</strong>
                                    <code style={{ background: '#f0fdf4', padding: '4px 8px', borderRadius: '4px' }}>{tokenSnippet}</code>
                                </div>
                            )}
                         </div>
                         <Link to="/login" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: '12px', textDecoration: 'none', display: 'flex' }}>
                            Return to Login
                        </Link>
                     </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px', textAlign: 'center' }}>
                            Enter your username to receive a password reset link.
                        </p>
                        
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem' }}
                                required
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={status === 'loading'}>
                            {status === 'loading' ? 'Processing...' : 'Send Reset Link'}
                        </button>
                    </form>
                )}

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <Link to="/login" style={{ fontSize: '0.875rem', color: 'var(--accent-blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowLeft size={16} /> Back to Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}

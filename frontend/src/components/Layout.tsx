import React, { useState } from 'react';
import { NavLink, Outlet, useSearchParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Upload, Activity, Search, LogOut, Settings, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../client/apiClient';

export default function Layout() {
    const [searchParams, setSearchParams] = useSearchParams();
    const q = searchParams.get('q') ?? '';
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) setSearchParams({ q: val });
        else setSearchParams({});
    };
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMessage('');

        if (newPassword !== confirmPassword) {
            setStatus('error');
            setMessage('New passwords do not match');
            return;
        }

        try {
            const res = await authApi.updatePassword(currentPassword, newPassword);
            setStatus('success');
            setMessage(res.message);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setStatus('error');
            setMessage(err.response?.data?.detail || 'Failed to update password. Please check your current password.');
        }
    };
    
    return (
        <div className="app-layout">
            {/* ─── Sidebar ─── */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <div className="sidebar-brand-icon">CF</div>
                    <span className="sidebar-brand-text">ClaimFlow</span>
                </div>
                <nav className="sidebar-nav">
                    <NavLink
                        to="/"
                        end
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                        <LayoutDashboard size={17} />
                        <span>Overview</span>
                    </NavLink>
                    {user?.role === 'HOSPITAL' && (
                        <NavLink
                            to="/analytics"
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        >
                            <BarChart3 size={17} />
                            <span>Performance</span>
                        </NavLink>
                    )}
                    <NavLink
                        to="/role-analytics"
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                        <TrendingUp size={17} />
                        <span>Analytics</span>
                    </NavLink>
                    <NavLink
                        to="/upload"
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                        <Upload size={17} />
                        <span>Upload Claim</span>
                    </NavLink>
                </nav>
                <div className="sidebar-footer">
                    <Activity size={13} style={{ color: 'var(--success)' }} />
                    Engine Online
                </div>
            </aside>

            {/* ─── Main area ─── */}
            <div className="main-content">
                {/* Top header */}
                <header className="topbar">
                    <div className="topbar-greeting" style={{ textTransform: 'capitalize' }}>
                        Hello, {user?.username} ({user?.role.toLowerCase()}) 👋
                    </div>
                    <div className="topbar-search" style={{ padding: 0, background: 'transparent', border: 'none', minWidth: 280 }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'var(--bg-page)', border: '1px solid var(--border)',
                            borderRadius: '20px', padding: '7px 16px', width: '100%'
                        }}>
                            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <input
                                type="text"
                                placeholder="Search claims…"
                                value={q}
                                onChange={handleSearch}
                                style={{
                                    border: 'none', background: 'transparent', outline: 'none',
                                    fontSize: '0.85rem', color: 'var(--text-primary)',
                                    width: '100%', padding: 0,
                                }}
                            />
                            {q && (
                                <button
                                    onClick={() => setSearchParams({})}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: 0 }}
                                    title="Clear"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
                        <div className="topbar-avatar" style={{ background: user?.role === 'HOSPITAL' ? 'var(--accent-blue)' : 'var(--purple)' }}>
                            {user?.username.substring(0, 2).toUpperCase()}
                        </div>
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
                        >
                            <Settings size={16} /> Settings
                        </button>
                        <button
                            onClick={() => { logout(); navigate('/login'); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
                        >
                            <LogOut size={16} /> Logout
                        </button>
                        
                        {isSettingsOpen && (
                            <div style={{ position: 'absolute', top: '48px', right: '0', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', width: '300px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 100 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Update Password</h3>
                                    <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                                </div>
                                {status === 'success' && (
                                    <div style={{ color: 'var(--success)', fontSize: '0.75rem', marginBottom: '8px', background: 'var(--success-bg)', padding: '6px', borderRadius: '4px' }}>
                                        {message}
                                    </div>
                                )}
                                {status === 'error' && (
                                    <div style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '8px', background: 'var(--error-bg)', padding: '6px', borderRadius: '4px' }}>
                                        {message}
                                    </div>
                                )}
                                <form onSubmit={handleUpdatePassword}>
                                    <input 
                                        type="password" 
                                        placeholder="Current Password" 
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        style={{ width: '100%', marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem' }}
                                        required
                                    />
                                    <input 
                                        type="password" 
                                        placeholder="New Password" 
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        style={{ width: '100%', marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem' }}
                                        required
                                    />
                                    <input 
                                        type="password" 
                                        placeholder="Confirm New Password" 
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        style={{ width: '100%', marginBottom: '12px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem' }}
                                        required
                                    />
                                    <button type="submit" disabled={status === 'loading'} style={{ width: '100%', padding: '8px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>
                                        {status === 'loading' ? 'Saving...' : 'Update Password'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </header>
                {/* Page body */}
                <div className="page-content">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

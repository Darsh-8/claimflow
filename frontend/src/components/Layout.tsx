import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useSearchParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Upload, Activity, Search, LogOut, Settings, TrendingUp, Sun, Moon, ChevronDown, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../client/apiClient';
import { useNotifications } from '../contexts/NotificationContext';

export default function Layout() {
    const [searchParams, setSearchParams] = useSearchParams();
    const q = searchParams.get('q') ?? '';
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) {
            navigate(`/?q=${encodeURIComponent(val)}`);
        } else {
            navigate('/');
        }
    };
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSettingsMode, setIsSettingsMode] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
    
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }, [isDarkMode]);

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
                    <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
                        
                        {/* Notification Bell */}
                        <div ref={notificationRef} style={{ position: 'relative' }}>
                            <button 
                                onClick={() => { setIsNotificationOpen(!isNotificationOpen); setIsProfileMenuOpen(false); }}
                                style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', position: 'relative', color: 'var(--text-secondary)' }}
                            >
                                <Bell size={20} />
                                {unreadCount > 0 && (
                                    <span style={{ 
                                        position: 'absolute', top: '0px', right: '0px', 
                                        background: 'var(--error)', color: 'white', 
                                        fontSize: '0.65rem', fontWeight: 'bold', 
                                        height: '16px', minWidth: '16px', 
                                        borderRadius: '8px', display: 'flex', 
                                        alignItems: 'center', justifyContent: 'center',
                                        padding: '0 4px', border: '2px solid var(--bg-card)'
                                    }}>
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>
                            
                            {/* Notification Dropdown */}
                            {isNotificationOpen && (
                                <div style={{ 
                                    position: 'absolute', top: '48px', right: '-60px', 
                                    background: 'var(--bg-card)', border: '1px solid var(--border)', 
                                    borderRadius: '12px', width: '340px', 
                                    boxShadow: 'var(--shadow-lg)', zIndex: 100,
                                    maxHeight: '400px', display: 'flex', flexDirection: 'column'
                                }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Notifications</h3>
                                        {unreadCount > 0 && (
                                            <button 
                                                onClick={markAllAsRead} 
                                                style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
                                            >
                                                Mark all read
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ overflowY: 'auto', flex: 1, padding: notifications.length === 0 ? '24px' : '0' }}>
                                        {notifications.length === 0 ? (
                                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                No notifications yet
                                            </div>
                                        ) : (
                                            notifications.map(notif => (
                                                <div 
                                                    key={notif.id} 
                                                    onClick={() => {
                                                        if (!notif.read) markAsRead(notif.id);
                                                    }}
                                                    style={{ 
                                                        padding: '12px 16px', 
                                                        borderBottom: '1px solid var(--border)', 
                                                        background: notif.read ? 'transparent' : 'var(--bg-page)',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: notif.read ? 'var(--text-muted)' : 'var(--accent-blue)', textTransform: 'uppercase' }}>
                                                            {notif.type.replace(/_/g, ' ')}
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.85rem', color: notif.read ? 'var(--text-secondary)' : 'var(--text-primary)', lineHeight: 1.4 }}>
                                                        {notif.message}
                                                    </p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Profile Dropdown */}
                        <button
                            onClick={() => { setIsProfileMenuOpen(!isProfileMenuOpen); setIsSettingsMode(false); setIsNotificationOpen(false); }}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <div className="topbar-avatar" style={{ background: user?.role === 'HOSPITAL' ? 'var(--accent-blue)' : 'var(--purple)' }}>
                                {user?.username.substring(0, 2).toUpperCase()}
                            </div>
                            <ChevronDown size={16} color="var(--text-secondary)" style={{ transform: isProfileMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                        </button>
                        
                        {isProfileMenuOpen && !isSettingsMode && (
                            <div style={{ position: 'absolute', top: '48px', right: '0', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', minWidth: '220px', boxShadow: 'var(--shadow-md)', zIndex: 100 }}>
                                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{user?.username}</h3>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.role}</div>
                                </div>
                                <button className="dropdown-item" onClick={() => setIsSettingsMode(true)}>
                                    <Settings size={16} /> Settings
                                </button>
                                <button className="dropdown-item" onClick={() => setIsDarkMode(!isDarkMode)}>
                                    {isDarkMode ? <Sun size={16} /> : <Moon size={16} />} 
                                    {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                                </button>
                                <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
                                <button className="dropdown-item" onClick={() => { logout(); navigate('/login'); }}>
                                    <LogOut size={16} /> Logout
                                </button>
                            </div>
                        )}

                        {isProfileMenuOpen && isSettingsMode && (
                            <div style={{ position: 'absolute', top: '48px', right: '0', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', width: '300px', boxShadow: 'var(--shadow-md)', zIndex: 100 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button onClick={() => setIsSettingsMode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0 }}>
                                            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>←</span>
                                        </button>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Update Password</h3>
                                    </div>
                                    <button onClick={() => setIsProfileMenuOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
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
                                        style={{ width: '100%', marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem', background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                                        required
                                    />
                                    <input 
                                        type="password" 
                                        placeholder="New Password" 
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        style={{ width: '100%', marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem', background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                                        required
                                    />
                                    <input 
                                        type="password" 
                                        placeholder="Confirm New Password" 
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        style={{ width: '100%', marginBottom: '16px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem', background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                                        required
                                    />
                                    <button 
                                        type="submit" 
                                        disabled={status === 'loading'}
                                        style={{ width: '100%', padding: '8px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}
                                    >
                                        {status === 'loading' ? 'Updating...' : 'Update Password'}
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

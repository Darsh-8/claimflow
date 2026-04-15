import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, BarChart3, Upload, Activity, Search,
    LogOut, Settings, TrendingUp, Sun, Moon, ChevronDown,
    Bell, Plus, Menu,
    Users, Stethoscope, BedDouble, ClipboardList, Calendar, Receipt, HeartPulse,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../client/apiClient';
import { useNotifications } from '../contexts/NotificationContext';

// ─── Nav item with tooltip support when collapsed ───────────────────────────
interface NavItemProps {
    to: string;
    icon: React.ReactNode;
    label: string;
    collapsed: boolean;
    end?: boolean;
    badge?: number;
    accent?: boolean;
}

function NavItem({ to, icon, label, collapsed, end, badge, accent }: NavItemProps) {
    const location = useLocation();

    // Determine active state manually — React Router v7 function-form className
    // renders as a literal string in this setup, so we detect active via useLocation.
    const isActive = end
        ? location.pathname === to
        : location.pathname === to || location.pathname.startsWith(to + '/');

    const className = [
        'nav-link',
        isActive ? 'active' : '',
        accent ? 'nav-link-accent' : '',
    ].filter(Boolean).join(' ');

    return (
        <Tooltip.Provider delayDuration={0}>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <NavLink to={to} className={className}>
                        {/* Icon — always visible */}
                        <span style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
                            {icon}
                            {badge !== undefined && badge > 0 && collapsed && (
                                <span style={{
                                    position: 'absolute', top: '-4px', right: '-5px',
                                    background: 'var(--error)', color: '#fff',
                                    fontSize: '0.55rem', fontWeight: 700,
                                    height: '13px', minWidth: '13px',
                                    borderRadius: '7px', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    padding: '0 2px',
                                }}>
                                    {badge > 9 ? '9+' : badge}
                                </span>
                            )}
                        </span>

                        {/* Label — hidden when collapsed */}
                        {!collapsed && <span style={{ flex: 1, minWidth: 0 }}>{label}</span>}

                        {/* Badge chip in expanded mode */}
                        {!collapsed && badge !== undefined && badge > 0 && (
                            <span style={{
                                marginLeft: 'auto', background: 'var(--error)',
                                color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                                borderRadius: '100px', padding: '1px 6px', flexShrink: 0,
                            }}>
                                {badge}
                            </span>
                        )}
                    </NavLink>
                </Tooltip.Trigger>

                {/* Tooltip — shown only when collapsed */}
                {collapsed && (
                    <Tooltip.Portal>
                        <Tooltip.Content
                            side="right"
                            sideOffset={10}
                            style={{
                                background: '#1E293B', color: '#F8FAFC',
                                padding: '6px 12px', borderRadius: '6px',
                                fontSize: '0.8rem', fontWeight: 600,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                                zIndex: 9999,
                            }}
                        >
                            {label}
                            <Tooltip.Arrow style={{ fill: '#1E293B' }} />
                        </Tooltip.Content>
                    </Tooltip.Portal>
                )}
            </Tooltip.Root>
        </Tooltip.Provider>
    );
}

// ─── Section label ───────────────────────────────────────────────────────────
function SidebarSection({ label, collapsed }: { label: string; collapsed: boolean }) {
    if (collapsed) {
        return <div style={{ height: '1px', background: 'var(--border)', margin: '6px 10px' }} />;
    }
    return (
        <div style={{
            padding: '14px 22px 4px',
            fontSize: '0.65rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-muted)',
        }}>
            {label}
        </div>
    );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────
export default function Layout() {
    const [searchParams, setSearchParams] = useSearchParams();
    const q = searchParams.get('q') ?? '';
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });

    const toggleCollapse = () => {
        setIsCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            return next;
        });
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) navigate(`/?q=${encodeURIComponent(val)}`);
        else navigate('/');
    };

    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSettingsMode, setIsSettingsMode] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(
        () => document.documentElement.getAttribute('data-theme') === 'dark'
    );

    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (isDarkMode) document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
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
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setStatus('error');
            setMessage(axiosErr.response?.data?.detail || 'Failed to update password.');
        }
    };

    const EXPANDED_W = 260;
    const COLLAPSED_W = 72;
    const sidebarWidth = isCollapsed ? `${COLLAPSED_W}px` : `${EXPANDED_W}px`;
    // main content accounts for the sidebar width (sidebar is fixed, not flowing)
    const mainMarginLeft = sidebarWidth;

    return (
        <div className="app-layout">
            {/* ─── Sidebar ─────────────────────────────────────────────── */}
            <aside
                className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
                style={{
                    width: sidebarWidth,
                    transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                    overflowX: 'hidden',
                    overflowY: 'visible',
                }}
            >
                {/* ──── Brand header ──── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: isCollapsed ? '20px 0' : '20px 20px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    borderBottom: '1px solid var(--border)',
                    flexShrink: 0,
                }}>
                    <button
                        onClick={toggleCollapse}
                        title={isCollapsed ? 'Expand' : 'Collapse'}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px',
                            borderRadius: '6px',
                            flexShrink: 0,
                            transition: 'background 150ms ease, color 150ms ease',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'var(--border-subtle)';
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'none';
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                        }}
                    >
                        <Menu size={20} />
                    </button>
                    {!isCollapsed && (
                        <span style={{
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.5px',
                            whiteSpace: 'nowrap',
                        }}>ClaimFlow</span>
                    )}
                </div>

                {/* ──── Nav scrollable area ──── */}
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: '8px' }}>
                    {/* Quick action CTA at the top */}
                    <div style={{ padding: '8px 12px 12px' }}>
                        {user?.role === 'HOSPITAL' ? (
                            <NavItem to="/upload" icon={<Upload size={18} />} label="New Claim" collapsed={isCollapsed} accent />
                        ) : (
                            <NavItem to="/?status=VALIDATED" icon={<Plus size={18} />} label="Pending Review" collapsed={isCollapsed} accent />
                        )}
                    </div>

                    <nav className="sidebar-nav">
                        <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Overview" collapsed={isCollapsed} end />
                        {user?.role === 'HOSPITAL' && (
                            <NavItem to="/analytics" icon={<BarChart3 size={18} />} label="Performance" collapsed={isCollapsed} />
                        )}
                        <NavItem to="/role-analytics" icon={<TrendingUp size={18} />} label="Analytics" collapsed={isCollapsed} />
                    </nav>

                    {user?.role === 'HOSPITAL' && (
                        <>
                            <SidebarSection label="HMS" collapsed={isCollapsed} />
                            <nav className="sidebar-nav">
                                <NavItem to="/hms/analytics" icon={<HeartPulse size={18} />} label="HMS Analytics" collapsed={isCollapsed} />
                                <NavItem to="/hms/patients" icon={<Users size={18} />} label="Patients" collapsed={isCollapsed} />
                                <NavItem to="/hms/doctors" icon={<Stethoscope size={18} />} label="Doctors" collapsed={isCollapsed} />
                                <NavItem to="/hms/wards" icon={<BedDouble size={18} />} label="Wards" collapsed={isCollapsed} />
                                <NavItem to="/hms/admissions" icon={<ClipboardList size={18} />} label="Admissions" collapsed={isCollapsed} />
                                <NavItem to="/hms/appointments" icon={<Calendar size={18} />} label="Appointments" collapsed={isCollapsed} />
                                <NavItem to="/hms/billing" icon={<Receipt size={18} />} label="Billing" collapsed={isCollapsed} />
                            </nav>
                        </>
                    )}


                </div>

                {/* ──── Footer ──── */}
                <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: isCollapsed ? '14px 0' : '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    flexShrink: 0,
                    alignItems: isCollapsed ? 'center' : 'stretch',
                }}>

                    {/* User row — hidden when collapsed */}
                    {!isCollapsed && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 10px',
                            background: 'var(--border-subtle)',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                        }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                background: user?.role === 'HOSPITAL' ? 'var(--accent-blue)' : 'var(--purple)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
                            }}>
                                {user?.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {user?.username}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                    {user?.role.toLowerCase()}
                                </div>
                            </div>
                            <Activity size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                        </div>
                    )}
                </div>
            </aside>

            {/* ─── Main content ────────────────────────────────────────────── */}
            <div
                className="main-content"
                style={{
                    marginLeft: mainMarginLeft,
                    transition: 'margin-left 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* Top header */}
                <header className="topbar">
                    <div className="topbar-greeting" style={{ textTransform: 'capitalize' }}>
                        Hello, {user?.username} 👋
                    </div>
                    <div style={{ padding: 0, background: 'transparent', border: 'none', minWidth: 280 }}>
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
                                >✕</button>
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
                                            <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>
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
                                                    onClick={() => { if (!notif.read) markAsRead(notif.id); }}
                                                    style={{
                                                        padding: '12px 16px',
                                                        borderBottom: '1px solid var(--border)',
                                                        background: notif.read ? 'transparent' : 'var(--accent-light)',
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
                                    <input type="password" placeholder="Current Password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={{ width: '100%', marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem', background: 'var(--bg-page)', color: 'var(--text-primary)' }} required />
                                    <input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ width: '100%', marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem', background: 'var(--bg-page)', color: 'var(--text-primary)' }} required />
                                    <input type="password" placeholder="Confirm New Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: '100%', marginBottom: '16px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.875rem', background: 'var(--bg-page)', color: 'var(--text-primary)' }} required />
                                    <button type="submit" disabled={status === 'loading'} style={{ width: '100%', padding: '8px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
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

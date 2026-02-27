import { NavLink, Outlet, useSearchParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Upload, Activity, Search, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
                    <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="topbar-avatar" style={{ background: user?.role === 'HOSPITAL' ? 'var(--accent-blue)' : 'var(--purple)' }}>
                            {user?.username.substring(0, 2).toUpperCase()}
                        </div>
                        <button
                            onClick={() => { logout(); navigate('/login'); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
                        >
                            <LogOut size={16} /> Logout
                        </button>
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

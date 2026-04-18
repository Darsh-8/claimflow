import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
    ShieldCheck, Users, Building, Activity, FileCheck2,
    Plus, Trash2, KeyRound, Loader2, RefreshCw, X
} from 'lucide-react';
import { adminApi, type AdminStatsResponse, type AdminUserResponse } from '../client/apiClient';

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
    
    // Data states
    const [stats, setStats] = useState<AdminStatsResponse | null>(null);
    const [users, setUsers] = useState<AdminUserResponse[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal states
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isResetModalOpen, setResetModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AdminUserResponse | null>(null);
    
    // Form states
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('HOSPITAL');
    const [resetPasswordVal, setResetPasswordVal] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'overview') {
                const data = await adminApi.getStats();
                setStats(data);
            } else {
                const data = await adminApi.getUsers();
                setUsers(data);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load admin data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await adminApi.createUser({
                username: newUsername,
                password: newPassword,
                role: newRole
            });
            toast.success('User created successfully');
            setCreateModalOpen(false);
            setNewUsername('');
            setNewPassword('');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to create user');
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
        try {
            await adminApi.deleteUser(id);
            toast.success('User deleted successfully');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to delete user');
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;
        try {
            await adminApi.resetPassword(selectedUser.id, { new_password: resetPasswordVal });
            toast.success('Password reset successfully');
            setResetModalOpen(false);
            setResetPasswordVal('');
            setSelectedUser(null);
        } catch (error: any) {
            toast.error('Failed to reset password');
        }
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            <div className="page-header" style={{ marginBottom: '24px' }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldCheck size={26} style={{ color: 'var(--primary)' }} />
                        System Administration
                    </h1>
                    <p className="page-subtitle">Manage users, roles, and view global system statistics.</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={15} /> Refresh
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
                <button
                    onClick={() => setActiveTab('overview')}
                    style={{
                        padding: '12px 20px', fontWeight: 600, fontSize: '0.95rem',
                        position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === 'overview' ? 'var(--primary)' : 'var(--text-secondary)',
                    }}
                >
                    Overview
                    {activeTab === 'overview' && (
                        <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: '2px', background: 'var(--primary)' }} />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '12px 20px', fontWeight: 600, fontSize: '0.95rem',
                        position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === 'users' ? 'var(--primary)' : 'var(--text-secondary)',
                    }}
                >
                    User Management
                    {activeTab === 'users' && (
                        <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: '2px', background: 'var(--primary)' }} />
                    )}
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: '14px', color: 'var(--text-muted)' }}>
                    <Loader2 size={32} style={{ animation: 'spin 0.7s linear infinite' }} />
                    <p>Loading...</p>
                </div>
            ) : activeTab === 'overview' && stats ? (
                /* ── OVERVIEW TAB ── */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    {/* Total Claims */}
                    <div className="card" style={{ padding: '24px', borderLeft: '4px solid var(--accent-blue)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Claims Processed</div>
                                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
                                    {stats.claims.total.toLocaleString()}
                                </div>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileCheck2 size={24} color="var(--info)" />
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{stats.claims.processing}</span> currently processing
                        </div>
                    </div>

                    {/* Total Users */}
                    <div className="card" style={{ padding: '24px', borderLeft: '4px solid var(--primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Users</div>
                                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
                                    {stats.users.total.toLocaleString()}
                                </div>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={24} color="var(--purple)" />
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Registered accounts across the system
                        </div>
                    </div>

                    {/* Breakdown */}
                    <div className="card" style={{ padding: '24px', borderLeft: '4px solid var(--success)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>User Breakdown</div>
                            <Activity size={20} color="var(--success)" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    <Building size={16} /> Hospitals
                                </span>
                                <span style={{ fontWeight: 600 }}>{stats.users.hospitals}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    <ShieldCheck size={16} /> Insurers
                                </span>
                                <span style={{ fontWeight: 600 }}>{stats.users.insurers}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    <KeyRound size={16} /> Admins
                                </span>
                                <span style={{ fontWeight: 600 }}>{stats.users.admins}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'users' ? (
                /* ── USERS TAB ── */
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>System Users</h2>
                        <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Plus size={16} /> Create User
                        </button>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                <th style={{ padding: '12px 16px' }}>ID</th>
                                <th style={{ padding: '12px 16px' }}>Username</th>
                                <th style={{ padding: '12px 16px' }}>Role</th>
                                <th style={{ padding: '12px 16px' }}>Claims Handled</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '16px', fontSize: '0.9rem', fontWeight: 500 }}>#{user.id}</td>
                                    <td style={{ padding: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '4px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700,
                                            background: user.role === 'ADMIN' ? 'var(--error-bg)' : user.role === 'INSURER' ? 'var(--info-bg)' : 'var(--success-bg)',
                                            color: user.role === 'ADMIN' ? 'var(--error)' : user.role === 'INSURER' ? 'var(--info)' : 'var(--success)',
                                        }}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                        {user.role === 'ADMIN' ? 'N/A' : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                <FileCheck2 size={14} /> {user.claim_count}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ padding: '6px 10px' }}
                                                onClick={() => { setSelectedUser(user); setResetModalOpen(true); }}
                                            >
                                                <KeyRound size={14} /> Reset
                                            </button>
                                            <button 
                                                className="btn" 
                                                style={{ padding: '6px 10px', border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent' }}
                                                onClick={() => handleDeleteUser(user.id)}
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {/* CREATE MODAL */}
            {isCreateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Create New User</h3>
                            <button onClick={() => setCreateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>Username</label>
                                <input required type="text" className="form-input" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="e.g., city_hospital" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>Password</label>
                                <input required type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>Role</label>
                                <select className="form-input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                                    <option value="HOSPITAL">Hospital</option>
                                    <option value="INSURER">Insurer</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create Account</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* RESET PASSWORD MODAL */}
            {isResetModalOpen && selectedUser && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Reset Password</h3>
                            <button onClick={() => setResetModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Resetting password for <strong>{selectedUser.username}</strong>.
                        </p>
                        <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 500 }}>New Password</label>
                                <input required type="text" className="form-input" value={resetPasswordVal} onChange={e => setResetPasswordVal(e.target.value)} placeholder="Type new password" />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setResetModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Update Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

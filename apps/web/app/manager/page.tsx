'use client';

import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { API_URL } from '@/config/contracts';

// Types
interface Project {
    id: number;
    name: string;
    location: string | null;
    default_rate_per_hour: number;
    worker_count: number;
}

interface Worker {
    id: string;
    full_name: string;
    phone: string | null;
    wallet_address: string | null;
    project_id: number | null;
    project_name: string | null;
    rate_per_hour: number | null;
    status: string;
}

// Tab type
type Tab = 'projects' | 'workers' | 'shifts' | 'reviews';

export default function ManagerPage() {
    // Auth
    const [token, setToken] = useState('');
    const [savedToken, setSavedToken] = useState('');

    // Data
    const [projects, setProjects] = useState<Project[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

    // UI State
    const [activeTab, setActiveTab] = useState<Tab>('projects');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // Form states
    const [projectForm, setProjectForm] = useState({ name: '', location: '', default_rate_per_hour: 500 });
    const [workerForm, setWorkerForm] = useState({ full_name: '', phone: '', wallet_address: '', project_id: '', rate_per_hour: '' });
    const [shiftForm, setShiftForm] = useState({ date: new Date().toISOString().split('T')[0], hours_worked: 8, notes: '' });
    const [reviewForm, setReviewForm] = useState({ review_date: new Date().toISOString().split('T')[0], rating: 5, comment: '', reviewer_name: '' });
    const [linkWalletForm, setLinkWalletForm] = useState({ wallet_address: '' });

    // Load token from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('manager_token');
        if (stored) {
            setSavedToken(stored);
            setToken(stored);
        }
    }, []);

    // Save token
    const handleSaveToken = () => {
        localStorage.setItem('manager_token', token);
        setSavedToken(token);
        setMessage('Token saved!');
        setTimeout(() => setMessage(''), 2000);
    };

    // API helper
    const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${savedToken}`,
            'Content-Type': 'application/json',
        };

        const res = await fetch(`${API_URL}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(err.detail || 'Request failed');
        }

        return res.json();
    };

    // Fetch projects
    const fetchProjects = async () => {
        if (!savedToken) return;
        setLoading(true);
        try {
            const data = await apiCall('/manager/projects');
            setProjects(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch workers
    const fetchWorkers = async () => {
        if (!savedToken) return;
        setLoading(true);
        try {
            const data = await apiCall('/manager/workers');
            setWorkers(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Create project
    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await apiCall('/manager/projects', 'POST', projectForm);
            setMessage('Project created!');
            setProjectForm({ name: '', location: '', default_rate_per_hour: 500 });
            fetchProjects();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Create worker
    const handleCreateWorker = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const body: any = { full_name: workerForm.full_name };
            if (workerForm.phone) body.phone = workerForm.phone;
            if (workerForm.wallet_address) body.wallet_address = workerForm.wallet_address;
            if (workerForm.project_id) body.project_id = parseInt(workerForm.project_id);
            if (workerForm.rate_per_hour) body.rate_per_hour = parseInt(workerForm.rate_per_hour);

            await apiCall('/manager/workers', 'POST', body);
            setMessage('Worker created!');
            setWorkerForm({ full_name: '', phone: '', wallet_address: '', project_id: '', rate_per_hour: '' });
            fetchWorkers();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Link wallet
    const handleLinkWallet = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWorker) return;
        setError('');
        try {
            await apiCall(`/manager/workers/${selectedWorker.id}`, 'PATCH', { wallet_address: linkWalletForm.wallet_address });
            setMessage('Wallet linked!');
            setLinkWalletForm({ wallet_address: '' });
            fetchWorkers();
            setSelectedWorker(null);
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Add shift
    const handleAddShift = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWorker) return;
        setError('');
        try {
            const body: any = {
                date: shiftForm.date,
                hours_worked: shiftForm.hours_worked,
            };
            if (shiftForm.notes) body.notes = shiftForm.notes;

            await apiCall(`/manager/workers/${selectedWorker.id}/shifts`, 'POST', body);
            setMessage('Shift added!');
            setShiftForm({ date: new Date().toISOString().split('T')[0], hours_worked: 8, notes: '' });
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Add review
    const handleAddReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWorker) return;
        setError('');
        try {
            const body: any = {
                review_date: reviewForm.review_date,
                rating: reviewForm.rating,
            };
            if (reviewForm.comment) body.comment = reviewForm.comment;
            if (reviewForm.reviewer_name) body.reviewer_name = reviewForm.reviewer_name;

            await apiCall(`/manager/workers/${selectedWorker.id}/reviews`, 'POST', body);
            setMessage('Review added!');
            setReviewForm({ review_date: new Date().toISOString().split('T')[0], rating: 5, comment: '', reviewer_name: '' });
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Load data when token changes
    useEffect(() => {
        if (savedToken) {
            fetchProjects();
            fetchWorkers();
        }
    }, [savedToken]);

    return (
        <div className="container synapse-page">
            <Navigation />

            <main style={{ paddingTop: 48 }}>
                <h1 className="synapse-page-title" style={{ marginTop: 32, marginBottom: 24 }}>Manager Portal</h1>

                {/* Token Input */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h2 className="synapse-heading" style={{ marginBottom: 16 }}>Authentication</h2>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            type="password"
                            placeholder="Manager Token"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            style={{ flex: 1, minWidth: 200 }}
                        />
                        <button className="btn btn-primary" onClick={handleSaveToken}>
                            Save Token
                        </button>
                    </div>
                    {savedToken && (
                        <p style={{ marginTop: 8, color: 'var(--synapse-emerald)', fontSize: 14 }}>
                            ✓ Token saved
                        </p>
                    )}
                </div>

                {/* Messages */}
                {message && (
                    <div className="synapse-alert synapse-alert-success" style={{ marginBottom: 16 }}>
                        {message}
                    </div>
                )}
                {error && (
                    <div className="synapse-alert synapse-alert-error" style={{ marginBottom: 16 }}>
                        {error}
                    </div>
                )}

                {savedToken && (
                    <>
                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                            {(['projects', 'workers', 'shifts', 'reviews'] as Tab[]).map((tab) => (
                                <button
                                    key={tab}
                                    className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Projects Tab */}
                        {activeTab === 'projects' && (
                            <div className="card">
                                <h2 className="synapse-heading" style={{ marginBottom: 16 }}>Create Project</h2>
                                <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <input
                                        type="text"
                                        placeholder="Project Name *"
                                        value={projectForm.name}
                                        onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="Location (optional)"
                                        value={projectForm.location}
                                        onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Default Rate/Hour (₹)"
                                        value={projectForm.default_rate_per_hour}
                                        onChange={(e) => setProjectForm({ ...projectForm, default_rate_per_hour: parseInt(e.target.value) || 0 })}
                                    />
                                    <button type="submit" className="btn btn-primary">Create Project</button>
                                </form>

                                <h3 className="synapse-heading" style={{ marginTop: 24, marginBottom: 16 }}>Projects</h3>
                                {loading ? (
                                    <p>Loading...</p>
                                ) : projects.length === 0 ? (
                                    <p style={{ color: 'rgba(163,163,163,1)' }}>No projects yet.</p>
                                ) : (
                                    <table className="synapse-table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Name</th>
                                                <th>Location</th>
                                                <th>Rate/Hr</th>
                                                <th>Workers</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {projects.map((p) => (
                                                <tr key={p.id}>
                                                    <td>{p.id}</td>
                                                    <td>{p.name}</td>
                                                    <td>{p.location || '-'}</td>
                                                    <td>₹{p.default_rate_per_hour}</td>
                                                    <td>{p.worker_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {/* Workers Tab */}
                        {activeTab === 'workers' && (
                            <div className="card">
                                <h2 className="synapse-heading" style={{ marginBottom: 16 }}>Create Worker</h2>
                                <form onSubmit={handleCreateWorker} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <input
                                        type="text"
                                        placeholder="Full Name *"
                                        value={workerForm.full_name}
                                        onChange={(e) => setWorkerForm({ ...workerForm, full_name: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="Phone (optional)"
                                        value={workerForm.phone}
                                        onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Wallet Address (optional, 0x...)"
                                        value={workerForm.wallet_address}
                                        onChange={(e) => setWorkerForm({ ...workerForm, wallet_address: e.target.value })}
                                    />
                                    <select
                                        value={workerForm.project_id}
                                        onChange={(e) => setWorkerForm({ ...workerForm, project_id: e.target.value })}
                                    >
                                        <option value="">Select Project (optional)</option>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        placeholder="Custom Rate/Hour (optional, ₹)"
                                        value={workerForm.rate_per_hour}
                                        onChange={(e) => setWorkerForm({ ...workerForm, rate_per_hour: e.target.value })}
                                    />
                                    <button type="submit" className="btn btn-primary">Create Worker</button>
                                </form>

                                <h3 className="synapse-heading" style={{ marginTop: 24, marginBottom: 16 }}>Workers</h3>
                                {loading ? (
                                    <p>Loading...</p>
                                ) : workers.length === 0 ? (
                                    <p style={{ color: 'rgba(163,163,163,1)' }}>No workers yet.</p>
                                ) : (
                                    <table className="synapse-table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Project</th>
                                                <th>Rate</th>
                                                <th>Wallet</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {workers.map((w) => (
                                                <tr key={w.id}>
                                                    <td>{w.full_name}</td>
                                                    <td>{w.project_name || '-'}</td>
                                                    <td>{w.rate_per_hour ? `₹${w.rate_per_hour}` : 'Default'}</td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                                        {w.wallet_address ? `${w.wallet_address.slice(0, 6)}...${w.wallet_address.slice(-4)}` : 'Not linked'}
                                                    </td>
                                                    <td>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '4px 8px', fontSize: 12 }}
                                                            onClick={() => {
                                                                setSelectedWorker(w);
                                                                setActiveTab('shifts');
                                                            }}
                                                        >
                                                            Select
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {/* Shifts Tab */}
                        {activeTab === 'shifts' && (
                            <div className="card">
                                <h2 className="synapse-heading" style={{ marginBottom: 16 }}>Add Shift / Link Wallet</h2>

                                {/* Worker Select */}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', marginBottom: 8 }}>Select Worker:</label>
                                    <select
                                        value={selectedWorker?.id || ''}
                                        onChange={(e) => {
                                            const w = workers.find(w => w.id === e.target.value);
                                            setSelectedWorker(w || null);
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Choose a worker...</option>
                                        {workers.map((w) => (
                                            <option key={w.id} value={w.id}>{w.full_name} ({w.project_name || 'No project'})</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedWorker && (
                                    <>
                                        <div style={{ padding: 12, background: 'rgba(16,185,129,0.1)', borderRadius: 8, marginBottom: 16 }}>
                                            <strong>Selected:</strong> {selectedWorker.full_name}
                                            {selectedWorker.wallet_address && (
                                                <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 12 }}>
                                                    ({selectedWorker.wallet_address.slice(0, 10)}...)
                                                </span>
                                            )}
                                        </div>

                                        {/* Link Wallet Form */}
                                        {!selectedWorker.wallet_address && (
                                            <div style={{ marginBottom: 24, padding: 16, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
                                                <h3 style={{ marginBottom: 12 }}>Link Wallet</h3>
                                                <form onSubmit={handleLinkWallet} style={{ display: 'flex', gap: 12 }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Wallet Address (0x...)"
                                                        value={linkWalletForm.wallet_address}
                                                        onChange={(e) => setLinkWalletForm({ wallet_address: e.target.value })}
                                                        style={{ flex: 1 }}
                                                        required
                                                    />
                                                    <button type="submit" className="btn btn-primary">Link</button>
                                                </form>
                                            </div>
                                        )}

                                        {/* Add Shift Form */}
                                        <h3 style={{ marginBottom: 12 }}>Add Shift</h3>
                                        <form onSubmit={handleAddShift} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <input
                                                type="date"
                                                value={shiftForm.date}
                                                onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })}
                                                required
                                            />
                                            <input
                                                type="number"
                                                placeholder="Hours Worked"
                                                value={shiftForm.hours_worked}
                                                onChange={(e) => setShiftForm({ ...shiftForm, hours_worked: parseFloat(e.target.value) || 0 })}
                                                step="0.5"
                                                required
                                            />
                                            <input
                                                type="text"
                                                placeholder="Notes (optional)"
                                                value={shiftForm.notes}
                                                onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                                            />
                                            <button type="submit" className="btn btn-primary">Add Shift</button>
                                        </form>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Reviews Tab */}
                        {activeTab === 'reviews' && (
                            <div className="card">
                                <h2 className="synapse-heading" style={{ marginBottom: 16 }}>Add Performance Review</h2>

                                {/* Worker Select */}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', marginBottom: 8 }}>Select Worker:</label>
                                    <select
                                        value={selectedWorker?.id || ''}
                                        onChange={(e) => {
                                            const w = workers.find(w => w.id === e.target.value);
                                            setSelectedWorker(w || null);
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Choose a worker...</option>
                                        {workers.map((w) => (
                                            <option key={w.id} value={w.id}>{w.full_name}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedWorker && (
                                    <>
                                        <div style={{ padding: 12, background: 'rgba(16,185,129,0.1)', borderRadius: 8, marginBottom: 16 }}>
                                            <strong>Selected:</strong> {selectedWorker.full_name}
                                        </div>

                                        <form onSubmit={handleAddReview} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <input
                                                type="date"
                                                value={reviewForm.review_date}
                                                onChange={(e) => setReviewForm({ ...reviewForm, review_date: e.target.value })}
                                                required
                                            />
                                            <div>
                                                <label style={{ display: 'block', marginBottom: 8 }}>Rating: {reviewForm.rating} ★</label>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="5"
                                                    value={reviewForm.rating}
                                                    onChange={(e) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value) })}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                            <textarea
                                                placeholder="Comment (optional)"
                                                value={reviewForm.comment}
                                                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                                                rows={3}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Reviewer Name (optional)"
                                                value={reviewForm.reviewer_name}
                                                onChange={(e) => setReviewForm({ ...reviewForm, reviewer_name: e.target.value })}
                                            />
                                            <button type="submit" className="btn btn-primary">Add Review</button>
                                        </form>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

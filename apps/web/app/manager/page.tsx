'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { PriorityChecklist } from '@/components/PriorityChecklist';
import { API_URL } from '@/config/contracts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Project {
    id: number;
    name: string;
    location: string | null;
    default_rate_per_hour: number;
    worker_count: number;
    created_at: string;
}

interface Worker {
    id: number;
    full_name: string;
    phone: string | null;
    wallet_address: string | null;
    project_id: number | null;
    project_name: string | null;
    rate_per_hour: number | null;
    status: string;
    created_at: string;
}

interface ShiftResponse {
    id: number;
    worker_id: number;
    project_id: number;
    project_name: string | null;
    date: string;
    hours_worked: number;
    work_units: number;
    earned: number;
    notes: string | null;
}

interface ReviewResponse {
    id: number;
    worker_id: number;
    review_date: string;
    rating: number;
    comment: string | null;
    reviewer_name: string | null;
}

interface InsightWorker {
    worker_id: number;
    worker_name: string;
    project_name: string | null;
    wallet_linked: boolean;
    status: string;
    total_shifts: number;
    total_earned: number;
    avg_rating: number | null;
    reasons: { code: string; label: string; detail: string }[];
    severity_score: number;
}

type Tab = 'projects' | 'workers' | 'insights';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ManagerPage() {
    // ── Auth ──
    const DEFAULT_DEV_TOKEN = 'manager-secret-token';
    const [tokenInput, setTokenInput] = useState(DEFAULT_DEV_TOKEN);
    const [savedToken, setSavedToken] = useState('');
    const [authVerified, setAuthVerified] = useState(false);
    const [authChecking, setAuthChecking] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [authError, setAuthError] = useState('');

    // ── Data ──
    const [projects, setProjects] = useState<Project[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);

    // ── Worker detail panel ──
    const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
    const [workerShifts, setWorkerShifts] = useState<ShiftResponse[]>([]);
    const [workerReviews, setWorkerReviews] = useState<ReviewResponse[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // ── Insights ──
    const [insights, setInsights] = useState<InsightWorker[]>([]);
    const [insightsLoading, setInsightsLoading] = useState(false);

    // ── UI ──
    const [activeTab, setActiveTab] = useState<Tab>('projects');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ── Forms ──
    const [projectForm, setProjectForm] = useState({ name: '', location: '', default_rate_per_hour: 500 });
    const [workerForm, setWorkerForm] = useState({ full_name: '', phone: '', wallet_address: '', project_id: '', rate_per_hour: '' });
    const [shiftForm, setShiftForm] = useState({ date: new Date().toISOString().split('T')[0], hours_worked: 8, notes: '' });
    const [reviewForm, setReviewForm] = useState({ review_date: new Date().toISOString().split('T')[0], rating: 5, comment: '', reviewer_name: '' });
    const [linkWalletInput, setLinkWalletInput] = useState('');

    // ── Edit worker modal ──
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
    const [editForm, setEditForm] = useState({ full_name: '', phone: '', project_id: '', rate_per_hour: '', status: '' });

    /* ── Toast helper ── */
    const flash = useCallback((type: 'success' | 'error', text: string) => {
        setToast({ type, text });
        setTimeout(() => setToast(null), 4000);
    }, []);

    /* ── Generic API caller ── */
    const api = useCallback(async (endpoint: string, method = 'GET', body?: unknown, token?: string) => {
        const tkn = token || savedToken;
        if (!tkn) throw new Error('Not authenticated');
        const res = await fetch(`${API_URL}${endpoint}`, {
            method,
            headers: {
                Authorization: `Bearer ${tkn}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
            throw new Error(err.detail || 'Request failed');
        }
        return res.json();
    }, [savedToken]);

    /* ── Verify token against API ── */
    const verifyToken = useCallback(async (token: string): Promise<{ ok: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_URL}/manager/verify`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) return { ok: true };
            const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
            return { ok: false, error: data.detail || `Server returned ${res.status}` };
        } catch (err) {
            return { ok: false, error: `Cannot reach API at ${API_URL}. Is the backend running?` };
        }
    }, []);

    /* ── Load saved token and auto-authenticate ── */
    useEffect(() => {
        const stored = localStorage.getItem('manager_token');
        const tokenToUse = stored ? stored.trim() : DEFAULT_DEV_TOKEN;

        setTokenInput(tokenToUse);
        setSavedToken(tokenToUse);
        setAuthChecking(true);

        verifyToken(tokenToUse).then(result => {
            setAuthChecking(false);
            if (result.ok) {
                localStorage.setItem('manager_token', tokenToUse);
                setSavedToken(tokenToUse);
                setAuthVerified(true);
            } else {
                // If stored token failed, try the default dev token as fallback
                if (stored && tokenToUse !== DEFAULT_DEV_TOKEN) {
                    setTokenInput(DEFAULT_DEV_TOKEN);
                    setSavedToken(DEFAULT_DEV_TOKEN);
                    verifyToken(DEFAULT_DEV_TOKEN).then(fallback => {
                        if (fallback.ok) {
                            localStorage.setItem('manager_token', DEFAULT_DEV_TOKEN);
                            setSavedToken(DEFAULT_DEV_TOKEN);
                            setAuthVerified(true);
                        } else {
                            localStorage.removeItem('manager_token');
                            setSavedToken('');
                            setAuthError(fallback.error || 'Token invalid');
                        }
                    });
                } else {
                    localStorage.removeItem('manager_token');
                    setSavedToken('');
                    setTokenInput(DEFAULT_DEV_TOKEN);
                    setAuthError(result.error || 'Cannot connect to API');
                }
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Save & verify token ── */
    const handleSaveToken = async () => {
        const clean = tokenInput.trim();
        if (!clean) { flash('error', 'Enter a token first'); return; }

        setAuthChecking(true);
        setAuthError('');
        const result = await verifyToken(clean);
        setAuthChecking(false);

        if (result.ok) {
            localStorage.setItem('manager_token', clean);
            setSavedToken(clean);
            setAuthVerified(true);
            setAuthError('');
            flash('success', 'Token verified and saved');
        } else {
            setAuthVerified(false);
            setAuthError(result.error || 'Token invalid');
            flash('error', result.error || 'Invalid token');
        }
    };

    const handleClearToken = () => {
        localStorage.removeItem('manager_token');
        setSavedToken('');
        setTokenInput('');
        setAuthVerified(false);
        setProjects([]);
        setWorkers([]);
        flash('success', 'Logged out');
    };

    /* ── Fetch data ── */
    const fetchProjects = useCallback(async () => {
        if (!savedToken || !authVerified) return;
        try { setProjects(await api('/manager/projects')); }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to load projects';
            flash('error', msg);
        }
    }, [savedToken, authVerified, api, flash]);

    const fetchWorkers = useCallback(async () => {
        if (!savedToken || !authVerified) return;
        try { setWorkers(await api('/manager/workers')); }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to load workers';
            flash('error', msg);
        }
    }, [savedToken, authVerified, api, flash]);

    const fetchInsights = useCallback(async () => {
        if (!savedToken || !authVerified) return;
        try {
            setInsightsLoading(true);
            const data = await api('/suggestions/manager');
            setInsights(data.insights || []);
        } catch { /* silent */ }
        finally { setInsightsLoading(false); }
    }, [savedToken, authVerified, api]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchProjects(), fetchWorkers(), fetchInsights()]);
        setLoading(false);
    }, [fetchProjects, fetchWorkers, fetchInsights]);

    useEffect(() => { if (savedToken && authVerified) fetchAll(); }, [savedToken, authVerified, fetchAll]);

    /* ── Fetch worker detail (shifts + reviews) ── */
    const fetchWorkerDetail = useCallback(async (workerId: number) => {
        setDetailLoading(true);
        try {
            const [shifts, reviews] = await Promise.all([
                api(`/manager/workers/${workerId}/shifts`),
                api(`/manager/workers/${workerId}/reviews`),
            ]);
            setWorkerShifts(shifts);
            setWorkerReviews(reviews);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to load details';
            flash('error', msg);
        } finally {
            setDetailLoading(false);
        }
    }, [api, flash]);

    /* ── Toggle worker expand ── */
    const toggleWorkerExpand = (workerId: number) => {
        if (expandedWorkerId === workerId) {
            setExpandedWorkerId(null);
        } else {
            setExpandedWorkerId(workerId);
            fetchWorkerDetail(workerId);
        }
    };

    /* ── Create Project ── */
    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectForm.name.trim()) { flash('error', 'Project name is required'); return; }
        try {
            await api('/manager/projects', 'POST', {
                name: projectForm.name.trim(),
                location: projectForm.location.trim() || null,
                default_rate_per_hour: projectForm.default_rate_per_hour,
            });
            flash('success', `Project "${projectForm.name}" created`);
            setProjectForm({ name: '', location: '', default_rate_per_hour: 500 });
            fetchAll(); // Refresh both to update worker counts
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to create project';
            flash('error', msg);
        }
    };

    /* ── Create Worker ── */
    const handleCreateWorker = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!workerForm.full_name.trim()) { flash('error', 'Worker name is required'); return; }
        try {
            const body: Record<string, unknown> = { full_name: workerForm.full_name.trim() };
            if (workerForm.phone.trim()) body.phone = workerForm.phone.trim();
            if (workerForm.wallet_address.trim()) body.wallet_address = workerForm.wallet_address.trim();
            if (workerForm.project_id) body.project_id = parseInt(workerForm.project_id);
            if (workerForm.rate_per_hour) body.rate_per_hour = parseInt(workerForm.rate_per_hour);

            await api('/manager/workers', 'POST', body);
            flash('success', `Worker "${workerForm.full_name}" added`);
            setWorkerForm({ full_name: '', phone: '', wallet_address: '', project_id: '', rate_per_hour: '' });
            fetchAll(); // Refresh both to update project worker counts
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to create worker';
            flash('error', msg);
        }
    };

    /* ── Edit Worker ── */
    const openEditWorker = (w: Worker) => {
        setEditingWorker(w);
        setEditForm({
            full_name: w.full_name,
            phone: w.phone || '',
            project_id: w.project_id ? String(w.project_id) : '',
            rate_per_hour: w.rate_per_hour ? String(w.rate_per_hour) : '',
            status: w.status,
        });
    };

    const handleEditWorker = async () => {
        if (!editingWorker) return;
        try {
            const body: Record<string, unknown> = {};
            if (editForm.full_name.trim() !== editingWorker.full_name) body.full_name = editForm.full_name.trim();
            if ((editForm.phone || '') !== (editingWorker.phone || '')) body.phone = editForm.phone.trim() || null;
            if (editForm.project_id !== (editingWorker.project_id ? String(editingWorker.project_id) : '')) {
                body.project_id = editForm.project_id ? parseInt(editForm.project_id) : null;
            }
            if (editForm.rate_per_hour !== (editingWorker.rate_per_hour ? String(editingWorker.rate_per_hour) : '')) {
                body.rate_per_hour = editForm.rate_per_hour ? parseInt(editForm.rate_per_hour) : null;
            }
            if (editForm.status !== editingWorker.status) body.status = editForm.status;

            if (Object.keys(body).length === 0) {
                flash('error', 'No changes to save');
                return;
            }

            await api(`/manager/workers/${editingWorker.id}`, 'PATCH', body);
            flash('success', `Worker "${editForm.full_name}" updated`);
            setEditingWorker(null);
            fetchAll();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to update worker';
            flash('error', msg);
        }
    };

    /* ── Link Wallet ── */
    const handleLinkWallet = async (workerId: number) => {
        const addr = linkWalletInput.trim();
        if (!addr) { flash('error', 'Enter a wallet address'); return; }
        if (!addr.startsWith('0x') || addr.length !== 42) {
            flash('error', 'Invalid wallet address format (0x... 42 chars)');
            return;
        }
        try {
            await api(`/manager/workers/${workerId}`, 'PATCH', { wallet_address: addr });
            flash('success', 'Wallet linked successfully');
            setLinkWalletInput('');
            fetchAll();
            if (expandedWorkerId === workerId) fetchWorkerDetail(workerId);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to link wallet';
            flash('error', msg);
        }
    };

    /* ── Add Shift ── */
    const handleAddShift = async (workerId: number) => {
        if (!shiftForm.date || shiftForm.hours_worked <= 0) {
            flash('error', 'Date and hours are required');
            return;
        }
        try {
            const body: Record<string, unknown> = {
                date: shiftForm.date,
                hours_worked: shiftForm.hours_worked,
            };
            if (shiftForm.notes.trim()) body.notes = shiftForm.notes.trim();
            await api(`/manager/workers/${workerId}/shifts`, 'POST', body);
            flash('success', 'Shift logged');
            setShiftForm({ date: new Date().toISOString().split('T')[0], hours_worked: 8, notes: '' });
            fetchWorkerDetail(workerId);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to add shift';
            flash('error', msg);
        }
    };

    /* ── Add Review ── */
    const handleAddReview = async (workerId: number) => {
        if (!reviewForm.review_date) { flash('error', 'Review date is required'); return; }
        try {
            const body: Record<string, unknown> = {
                review_date: reviewForm.review_date,
                rating: reviewForm.rating,
            };
            if (reviewForm.comment.trim()) body.comment = reviewForm.comment.trim();
            if (reviewForm.reviewer_name.trim()) body.reviewer_name = reviewForm.reviewer_name.trim();
            await api(`/manager/workers/${workerId}/reviews`, 'POST', body);
            flash('success', 'Review added');
            setReviewForm({ review_date: new Date().toISOString().split('T')[0], rating: 5, comment: '', reviewer_name: '' });
            fetchWorkerDetail(workerId);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to add review';
            flash('error', msg);
        }
    };

    /* ── Helpers ── */
    const renderStars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
    const workersForProject = (pid: number) => workers.filter(w => w.project_id === pid);
    const unassignedWorkers = workers.filter(w => !w.project_id);

    /* ================================================================ */
    /*  RENDER                                                          */
    /* ================================================================ */

    return (
        <div className="container synapse-page">
            <Navigation />

            <main style={{ paddingTop: 48, maxWidth: 960, margin: '0 auto' }}>
                <h1 className="synapse-page-title" style={{ marginTop: 32, marginBottom: 8 }}>
                    Manager Portal
                </h1>
                <p style={{ marginBottom: 32, color: 'rgba(163,163,163,1)', fontSize: 15 }}>
                    Manage projects, assign workers, log shifts and reviews.
                </p>

                {/* ── Toast ── */}
                {toast && (
                    <div
                        style={{
                            position: 'fixed', top: 24, right: 24, zIndex: 9999,
                            padding: '14px 24px', borderRadius: 10,
                            background: toast.type === 'success' ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
                            border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,.4)' : 'rgba(239,68,68,.4)'}`,
                            color: toast.type === 'success' ? '#10b981' : '#ef4444',
                            fontSize: 14, fontWeight: 500,
                            backdropFilter: 'blur(12px)',
                            maxWidth: 400,
                        }}
                    >
                        {toast.type === 'success' ? '✓' : '✗'} {toast.text}
                    </div>
                )}

                {/* ── Edit Worker Modal ── */}
                {editingWorker && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 9998,
                        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} onClick={() => setEditingWorker(null)}>
                        <div
                            style={{
                                background: '#1a1a2e', border: '1px solid rgba(255,255,255,.1)',
                                borderRadius: 16, padding: 32, width: 440, maxWidth: '90vw',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 style={{ margin: '0 0 20px', fontSize: 18 }}>Edit Worker</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <input
                                    type="text"
                                    placeholder="Full name"
                                    value={editForm.full_name}
                                    onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                />
                                <input
                                    type="text"
                                    placeholder="Phone"
                                    value={editForm.phone}
                                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                />
                                <select
                                    value={editForm.project_id}
                                    onChange={e => setEditForm({ ...editForm, project_id: e.target.value })}
                                >
                                    <option value="">No project</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    placeholder="Custom rate ₹/hr"
                                    value={editForm.rate_per_hour}
                                    onChange={e => setEditForm({ ...editForm, rate_per_hour: e.target.value })}
                                />
                                <select
                                    value={editForm.status}
                                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEditWorker}>
                                        Save Changes
                                    </button>
                                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingWorker(null)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Auth Card ── */}
                <div className="card" style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                            <input
                                type={showToken ? 'text' : 'password'}
                                placeholder="Enter manager token..."
                                value={tokenInput}
                                onChange={e => { setTokenInput(e.target.value); setAuthError(''); }}
                                onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                                style={{ width: '100%', paddingRight: 44 }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                style={{
                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'rgba(163,163,163,.6)', fontSize: 13, padding: '4px 6px',
                                }}
                            >
                                {showToken ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveToken}
                            disabled={authChecking}
                        >
                            {authChecking ? 'Verifying...' : authVerified ? 'Update Token' : 'Authenticate'}
                        </button>
                        {authVerified && (
                            <button
                                className="btn btn-secondary"
                                onClick={handleClearToken}
                                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,.25)' }}
                            >
                                Logout
                            </button>
                        )}
                    </div>
                    {authChecking && (
                        <p style={{ marginTop: 8, color: '#f59e0b', fontSize: 13 }}>
                            Verifying token with API at {API_URL}...
                        </p>
                    )}
                    {!authChecking && authVerified && (
                        <p style={{ marginTop: 8, color: '#10b981', fontSize: 13 }}>
                            ✓ Authenticated — token verified with server
                        </p>
                    )}
                    {!authChecking && authError && (
                        <p style={{ marginTop: 8, color: '#ef4444', fontSize: 13 }}>
                            ✗ {authError}
                        </p>
                    )}
                    {!authChecking && !authVerified && !authError && (
                        <div style={{ marginTop: 8 }}>
                            <p style={{ color: 'rgba(163,163,163,.6)', fontSize: 13, margin: 0 }}>
                                Enter the manager admin token and click Authenticate.
                            </p>
                            <p style={{ color: 'rgba(163,163,163,.4)', fontSize: 12, margin: '4px 0 0' }}>
                                Default dev token: <code
                                    onClick={() => { setTokenInput('manager-secret-token'); setAuthError(''); }}
                                    style={{
                                        background: 'rgba(167,139,250,.1)', color: '#a78bfa',
                                        padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                                        fontSize: 12, fontFamily: 'monospace',
                                    }}
                                >manager-secret-token</code>
                                <span style={{ marginLeft: 4, color: 'rgba(163,163,163,.3)' }}>(click to fill)</span>
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Main content (only when authenticated AND verified) ── */}
                {authVerified && (
                    <>
                        {/* ── Tab bar ── */}
                        <div style={{
                            display: 'flex', gap: 0, marginBottom: 32,
                            borderBottom: '1px solid rgba(255,255,255,.08)',
                        }}>
                            {(['projects', 'workers', 'insights'] as Tab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    style={{
                                        padding: '12px 28px',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: activeTab === tab ? '2px solid #a78bfa' : '2px solid transparent',
                                        color: activeTab === tab ? '#fff' : 'rgba(163,163,163,.8)',
                                        fontSize: 15, fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all .2s',
                                        position: 'relative',
                                    }}
                                >
                                    {tab === 'projects' ? 'Projects' : tab === 'workers' ? 'Workers' : 'Insights'}
                                    {tab === 'insights' && insights.length > 0 && (
                                        <span style={{
                                            position: 'absolute', top: 6, right: 6,
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: '#ef4444',
                                        }} />
                                    )}
                                </button>
                            ))}
                            {loading && (
                                <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 13, color: 'rgba(163,163,163,.6)' }}>
                                    Loading...
                                </span>
                            )}
                            <button
                                onClick={fetchAll}
                                style={{
                                    marginLeft: 'auto', background: 'none', border: 'none',
                                    color: 'rgba(163,163,163,.6)', cursor: 'pointer', fontSize: 13,
                                    alignSelf: 'center',
                                }}
                            >
                                Refresh
                            </button>
                        </div>

                        {/* ============================================ */}
                        {/*  PROJECTS TAB                                */}
                        {/* ============================================ */}
                        {activeTab === 'projects' && (
                            <>
                                {/* Create project form */}
                                <div className="card" style={{ marginBottom: 32 }}>
                                    <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>New Project</h2>
                                    <form onSubmit={handleCreateProject} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <input
                                            type="text"
                                            placeholder="Project name *"
                                            value={projectForm.name}
                                            onChange={e => setProjectForm({ ...projectForm, name: e.target.value })}
                                            required
                                            style={{ gridColumn: '1 / -1' }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Location (optional)"
                                            value={projectForm.location}
                                            onChange={e => setProjectForm({ ...projectForm, location: e.target.value })}
                                        />
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span style={{ whiteSpace: 'nowrap', fontSize: 14, color: 'rgba(163,163,163,1)' }}>₹/hr</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={projectForm.default_rate_per_hour}
                                                onChange={e => setProjectForm({ ...projectForm, default_rate_per_hour: parseInt(e.target.value) || 0 })}
                                                style={{ flex: 1 }}
                                            />
                                        </div>
                                        <button id="manager-create-project-btn" type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>
                                            Create Project
                                        </button>
                                    </form>
                                </div>

                                {/* Stats row */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                                    <div className="card" style={{ textAlign: 'center', padding: 20 }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: '#a78bfa' }}>{projects.length}</div>
                                        <div style={{ fontSize: 13, color: 'rgba(163,163,163,.8)' }}>Projects</div>
                                    </div>
                                    <div className="card" style={{ textAlign: 'center', padding: 20 }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{workers.length}</div>
                                        <div style={{ fontSize: 13, color: 'rgba(163,163,163,.8)' }}>Workers</div>
                                    </div>
                                    <div className="card" style={{ textAlign: 'center', padding: 20 }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{workers.filter(w => w.status === 'active').length}</div>
                                        <div style={{ fontSize: 13, color: 'rgba(163,163,163,.8)' }}>Active</div>
                                    </div>
                                </div>

                                {/* Project list with assigned workers */}
                                {projects.length === 0 ? (
                                    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'rgba(163,163,163,.6)' }}>
                                        No projects yet. Create one above.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {projects.map(p => {
                                            const pw = workersForProject(p.id);
                                            return (
                                                <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                                    {/* Header */}
                                                    <div style={{
                                                        padding: '20px 24px',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        borderBottom: pw.length > 0 ? '1px solid rgba(255,255,255,.06)' : 'none',
                                                    }}>
                                                        <div>
                                                            <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{p.name}</h3>
                                                            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(163,163,163,.8)' }}>
                                                                {p.location || 'No location'} &middot; ₹{p.default_rate_per_hour}/hr &middot; ID: {p.id}
                                                            </p>
                                                        </div>
                                                        <div style={{
                                                            background: pw.length > 0 ? 'rgba(167,139,250,.1)' : 'rgba(163,163,163,.08)',
                                                            color: pw.length > 0 ? '#a78bfa' : 'rgba(163,163,163,.5)',
                                                            padding: '6px 14px',
                                                            borderRadius: 20,
                                                            fontSize: 13, fontWeight: 500,
                                                        }}>
                                                            {pw.length} worker{pw.length !== 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                    {/* Workers under this project */}
                                                    {pw.length > 0 && (
                                                        <div style={{ padding: '12px 24px 16px' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                                {pw.map(w => (
                                                                    <span
                                                                        key={w.id}
                                                                        onClick={() => { setActiveTab('workers'); setTimeout(() => toggleWorkerExpand(w.id), 100); }}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                            padding: '6px 14px', borderRadius: 8,
                                                                            background: 'rgba(255,255,255,.04)',
                                                                            border: '1px solid rgba(255,255,255,.08)',
                                                                            fontSize: 13, cursor: 'pointer',
                                                                            transition: 'background .15s',
                                                                        }}
                                                                    >
                                                                        <span style={{
                                                                            width: 8, height: 8, borderRadius: '50%',
                                                                            background: w.status === 'active' ? '#10b981' : '#6b7280',
                                                                        }} />
                                                                        {w.full_name}
                                                                        {w.wallet_address && (
                                                                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(163,163,163,.6)' }}>
                                                                                {w.wallet_address.slice(0, 6)}...{w.wallet_address.slice(-4)}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Unassigned workers */}
                                        {unassignedWorkers.length > 0 && (
                                            <div className="card" style={{ padding: 0, overflow: 'hidden', borderColor: 'rgba(239,68,68,.15)' }}>
                                                <div style={{
                                                    padding: '16px 24px',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    borderBottom: '1px solid rgba(255,255,255,.06)',
                                                }}>
                                                    <div>
                                                        <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#f59e0b' }}>Unassigned</h3>
                                                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(163,163,163,.8)' }}>
                                                            Workers not assigned to any project
                                                        </p>
                                                    </div>
                                                    <div style={{
                                                        background: 'rgba(245,158,11,.1)', color: '#f59e0b',
                                                        padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                                                    }}>
                                                        {unassignedWorkers.length} worker{unassignedWorkers.length !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                                <div style={{ padding: '12px 24px 16px' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                        {unassignedWorkers.map(w => (
                                                            <span
                                                                key={w.id}
                                                                onClick={() => { setActiveTab('workers'); setTimeout(() => toggleWorkerExpand(w.id), 100); }}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                    padding: '6px 14px', borderRadius: 8,
                                                                    background: 'rgba(255,255,255,.04)',
                                                                    border: '1px solid rgba(245,158,11,.15)',
                                                                    fontSize: 13, cursor: 'pointer',
                                                                }}
                                                            >
                                                                <span style={{
                                                                    width: 8, height: 8, borderRadius: '50%',
                                                                    background: w.status === 'active' ? '#10b981' : '#6b7280',
                                                                }} />
                                                                {w.full_name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ============================================ */}
                        {/*  WORKERS TAB                                 */}
                        {/* ============================================ */}
                        {activeTab === 'workers' && (
                            <>
                                {/* Create worker form */}
                                <div className="card" style={{ marginBottom: 32 }}>
                                    <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Add Worker</h2>
                                    <form onSubmit={handleCreateWorker} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <input
                                            type="text"
                                            placeholder="Full name *"
                                            value={workerForm.full_name}
                                            onChange={e => setWorkerForm({ ...workerForm, full_name: e.target.value })}
                                            required
                                        />
                                        <input
                                            type="text"
                                            placeholder="Phone (optional)"
                                            value={workerForm.phone}
                                            onChange={e => setWorkerForm({ ...workerForm, phone: e.target.value })}
                                        />
                                        <select
                                            value={workerForm.project_id}
                                            onChange={e => setWorkerForm({ ...workerForm, project_id: e.target.value })}
                                        >
                                            <option value="">Assign to project...</option>
                                            {projects.map(p => (
                                                <option key={p.id} value={String(p.id)}>{p.name} (₹{p.default_rate_per_hour}/hr)</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            placeholder="Custom ₹/hr (optional)"
                                            value={workerForm.rate_per_hour}
                                            onChange={e => setWorkerForm({ ...workerForm, rate_per_hour: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Wallet address 0x... (optional)"
                                            value={workerForm.wallet_address}
                                            onChange={e => setWorkerForm({ ...workerForm, wallet_address: e.target.value })}
                                            style={{ gridColumn: '1 / -1' }}
                                        />
                                        <button id="manager-add-worker-btn" type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}>
                                            Add Worker
                                        </button>
                                    </form>
                                    {projects.length === 0 && (
                                        <p style={{ marginTop: 12, fontSize: 13, color: '#f59e0b' }}>
                                            Tip: Create a project first in the Projects tab so you can assign workers to it.
                                        </p>
                                    )}
                                </div>

                                {/* Workers list */}
                                {workers.length === 0 ? (
                                    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'rgba(163,163,163,.6)' }}>
                                        No workers yet. Add one above.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {workers.map(w => {
                                            const isExpanded = expandedWorkerId === w.id;
                                            return (
                                                <div key={w.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                                    {/* Worker row (clickable to expand) */}
                                                    <div
                                                        onClick={() => toggleWorkerExpand(w.id)}
                                                        style={{
                                                            padding: '16px 24px',
                                                            display: 'grid',
                                                            gridTemplateColumns: '1fr auto auto auto',
                                                            gap: 16, alignItems: 'center',
                                                            cursor: 'pointer',
                                                            transition: 'background .15s',
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{
                                                                    width: 8, height: 8, borderRadius: '50%',
                                                                    background: w.status === 'active' ? '#10b981' : '#6b7280',
                                                                }} />
                                                                <strong style={{ fontSize: 15 }}>{w.full_name}</strong>
                                                                <span style={{ fontSize: 11, color: 'rgba(163,163,163,.5)' }}>#{w.id}</span>
                                                            </div>
                                                            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(163,163,163,.8)' }}>
                                                                {w.project_name || 'Unassigned'}{w.rate_per_hour ? ` · ₹${w.rate_per_hour}/hr` : ''}
                                                            </p>
                                                        </div>
                                                        <div style={{ fontSize: 12, fontFamily: 'monospace', color: w.wallet_address ? '#10b981' : 'rgba(163,163,163,.5)' }}>
                                                            {w.wallet_address ? `${w.wallet_address.slice(0, 6)}...${w.wallet_address.slice(-4)}` : 'No wallet'}
                                                        </div>
                                                        {w.phone && (
                                                            <span style={{ fontSize: 13, color: 'rgba(163,163,163,.6)' }}>{w.phone}</span>
                                                        )}
                                                        <span style={{
                                                            fontSize: 18, color: 'rgba(163,163,163,.4)',
                                                            transition: 'transform .2s',
                                                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                                        }}>
                                                            ▾
                                                        </span>
                                                    </div>

                                                    {/* Expanded detail panel */}
                                                    {isExpanded && (
                                                        <div style={{
                                                            borderTop: '1px solid rgba(255,255,255,.06)',
                                                            padding: '20px 24px',
                                                            background: 'rgba(255,255,255,.01)',
                                                        }}>
                                                            {/* Quick action bar */}
                                                            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ fontSize: 12, padding: '6px 14px' }}
                                                                    onClick={(e) => { e.stopPropagation(); openEditWorker(w); }}
                                                                >
                                                                    Edit Worker
                                                                </button>
                                                                {!w.wallet_address && (
                                                                    <span style={{ fontSize: 12, color: '#f59e0b', alignSelf: 'center', marginLeft: 8 }}>
                                                                        No wallet linked
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {detailLoading ? (
                                                                <p style={{ textAlign: 'center', color: 'rgba(163,163,163,.6)' }}>Loading details...</p>
                                                            ) : (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                                                    {/* ── Left: Add Shift ── */}
                                                                    <div>
                                                                        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>Log Shift</h4>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                            <input type="date" value={shiftForm.date} onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })} />
                                                                            <input type="number" placeholder="Hours" step="0.5" min="0.5" value={shiftForm.hours_worked} onChange={e => setShiftForm({ ...shiftForm, hours_worked: parseFloat(e.target.value) || 0 })} />
                                                                            <input type="text" placeholder="Notes (optional)" value={shiftForm.notes} onChange={e => setShiftForm({ ...shiftForm, notes: e.target.value })} />
                                                                            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => handleAddShift(w.id)}>
                                                                                Add Shift
                                                                            </button>
                                                                        </div>

                                                                        {/* Shift history */}
                                                                        {workerShifts.length > 0 && (
                                                                            <div style={{ marginTop: 16 }}>
                                                                                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'rgba(163,163,163,.8)' }}>
                                                                                    Recent Shifts ({workerShifts.length})
                                                                                </h4>
                                                                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                                                        <thead>
                                                                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                                                                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(163,163,163,.6)', fontWeight: 500 }}>Date</th>
                                                                                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(163,163,163,.6)', fontWeight: 500 }}>Hours</th>
                                                                                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(163,163,163,.6)', fontWeight: 500 }}>Earned</th>
                                                                                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(163,163,163,.6)', fontWeight: 500 }}>Notes</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {workerShifts.map(s => (
                                                                                                <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                                                                                    <td style={{ padding: '6px 8px' }}>{s.date}</td>
                                                                                                    <td style={{ padding: '6px 8px' }}>{s.hours_worked}</td>
                                                                                                    <td style={{ padding: '6px 8px', color: '#10b981' }}>₹{s.earned.toLocaleString()}</td>
                                                                                                    <td style={{ padding: '6px 8px', color: 'rgba(163,163,163,.6)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes || '–'}</td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* ── Right: Review + Link Wallet ── */}
                                                                    <div>
                                                                        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>Add Review</h4>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                            <input type="date" value={reviewForm.review_date} onChange={e => setReviewForm({ ...reviewForm, review_date: e.target.value })} />
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                <span style={{ fontSize: 13, color: 'rgba(163,163,163,.8)' }}>Rating:</span>
                                                                                {[1, 2, 3, 4, 5].map(n => (
                                                                                    <span
                                                                                        key={n}
                                                                                        onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                                                                                        style={{ cursor: 'pointer', fontSize: 20, color: n <= reviewForm.rating ? '#f59e0b' : 'rgba(163,163,163,.3)' }}
                                                                                    >★</span>
                                                                                ))}
                                                                            </div>
                                                                            <input type="text" placeholder="Comment" value={reviewForm.comment} onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} />
                                                                            <input type="text" placeholder="Reviewer name" value={reviewForm.reviewer_name} onChange={e => setReviewForm({ ...reviewForm, reviewer_name: e.target.value })} />
                                                                            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => handleAddReview(w.id)}>
                                                                                Submit Review
                                                                            </button>
                                                                        </div>

                                                                        {/* Review history */}
                                                                        {workerReviews.length > 0 && (
                                                                            <div style={{ marginTop: 16 }}>
                                                                                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'rgba(163,163,163,.8)' }}>
                                                                                    Reviews ({workerReviews.length})
                                                                                </h4>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                                                                                    {workerReviews.map(r => (
                                                                                        <div key={r.id} style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', fontSize: 13 }}>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                <span style={{ color: '#f59e0b' }}>{renderStars(r.rating)}</span>
                                                                                                <span style={{ color: 'rgba(163,163,163,.5)', fontSize: 12 }}>{r.review_date}</span>
                                                                                            </div>
                                                                                            {r.comment && <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.7)' }}>&ldquo;{r.comment}&rdquo;</p>}
                                                                                            {r.reviewer_name && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(163,163,163,.5)' }}>— {r.reviewer_name}</p>}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Link Wallet */}
                                                                        {!w.wallet_address && (
                                                                            <div style={{ marginTop: 20, padding: 16, borderRadius: 8, border: '1px dashed rgba(167,139,250,.3)', background: 'rgba(167,139,250,.04)' }}>
                                                                                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#a78bfa' }}>Link Wallet</h4>
                                                                                <div style={{ display: 'flex', gap: 8 }}>
                                                                                    <input
                                                                                        type="text"
                                                                                        placeholder="0x..."
                                                                                        value={linkWalletInput}
                                                                                        onChange={e => setLinkWalletInput(e.target.value)}
                                                                                        style={{ flex: 1, fontSize: 13 }}
                                                                                    />
                                                                                    <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => handleLinkWallet(w.id)}>
                                                                                        Link
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ============================================ */}
                        {/*  INSIGHTS TAB                                */}
                        {/* ============================================ */}
                        {activeTab === 'insights' && (
                            <>
                                {/* Manager Checklist */}
                                <PriorityChecklist type="manager" managerToken={savedToken} />

                                {/* Insights Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Workers Needing Attention</h2>
                                    <span style={{ fontSize: 13, color: 'rgba(163,163,163,.6)' }}>
                                        {insights.length} worker{insights.length !== 1 ? 's' : ''} flagged
                                    </span>
                                </div>

                                {insightsLoading ? (
                                    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'rgba(163,163,163,.6)' }}>
                                        Loading insights...
                                    </div>
                                ) : insights.length === 0 ? (
                                    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                                        <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>&#x2705;</span>
                                        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>All clear!</h3>
                                        <p style={{ margin: 0, fontSize: 14, color: 'rgba(163,163,163,.6)' }}>
                                            No workers currently need attention.
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {insights.map(ins => {
                                            const severityColor = ins.severity_score >= 7 ? '#ef4444' : ins.severity_score >= 4 ? '#f59e0b' : '#818cf8';
                                            return (
                                                <div key={ins.worker_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                                    <div style={{ padding: '16px 20px' }}>
                                                        {/* Worker info row */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span style={{
                                                                        width: 8, height: 8, borderRadius: '50%',
                                                                        background: ins.status === 'active' ? '#10b981' : '#6b7280',
                                                                    }} />
                                                                    <strong style={{ fontSize: 15 }}>{ins.worker_name}</strong>
                                                                    <span style={{ fontSize: 11, color: 'rgba(163,163,163,.5)' }}>#{ins.worker_id}</span>
                                                                </div>
                                                                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(163,163,163,.7)' }}>
                                                                    {ins.project_name || 'No project'}
                                                                    {ins.total_shifts > 0 && <span> &middot; {ins.total_shifts} shifts</span>}
                                                                    {ins.total_earned > 0 && <span> &middot; &#8377;{ins.total_earned.toLocaleString()}</span>}
                                                                    {ins.avg_rating && <span> &middot; {ins.avg_rating}/5</span>}
                                                                </p>
                                                            </div>
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                fontSize: 12, color: severityColor, fontWeight: 600,
                                                            }}>
                                                                <span style={{
                                                                    width: 6, height: 6, borderRadius: '50%',
                                                                    background: severityColor,
                                                                }} />
                                                                Severity: {ins.severity_score}
                                                            </div>
                                                        </div>

                                                        {/* Reason tags */}
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                                            {ins.reasons.map((r, i) => {
                                                                const codeColors: Record<string, string> = {
                                                                    NO_WALLET: '#a78bfa', INACTIVE: '#ef4444', NO_LOGS: '#ef4444',
                                                                    LOW_UNITS: '#f59e0b', POOR_REVIEWS: '#ef4444', NO_REVIEWS: '#f59e0b',
                                                                    UNASSIGNED: '#818cf8',
                                                                };
                                                                const c = codeColors[r.code] || '#818cf8';
                                                                return (
                                                                    <div key={i} style={{
                                                                        padding: '6px 12px', borderRadius: 8,
                                                                        background: `${c}11`, border: `1px solid ${c}33`,
                                                                        fontSize: 12,
                                                                    }}>
                                                                        <span style={{ fontWeight: 600, color: c }}>{r.label}</span>
                                                                        <span style={{ color: 'rgba(163,163,163,.6)', marginLeft: 6 }}>{r.detail}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Quick Actions */}
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ fontSize: 12, padding: '6px 14px' }}
                                                                onClick={() => { setActiveTab('workers'); setTimeout(() => toggleWorkerExpand(ins.worker_id), 100); }}
                                                            >
                                                                View Details
                                                            </button>
                                                            {ins.reasons.some(r => r.code === 'NO_LOGS' || r.code === 'INACTIVE' || r.code === 'LOW_UNITS') && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ fontSize: 12, padding: '6px 14px', color: '#10b981', borderColor: 'rgba(16,185,129,.25)' }}
                                                                    onClick={() => { setActiveTab('workers'); setTimeout(() => toggleWorkerExpand(ins.worker_id), 100); }}
                                                                >
                                                                    Add Shift
                                                                </button>
                                                            )}
                                                            {ins.reasons.some(r => r.code === 'NO_REVIEWS' || r.code === 'POOR_REVIEWS') && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ fontSize: 12, padding: '6px 14px', color: '#f59e0b', borderColor: 'rgba(245,158,11,.25)' }}
                                                                    onClick={() => { setActiveTab('workers'); setTimeout(() => toggleWorkerExpand(ins.worker_id), 100); }}
                                                                >
                                                                    Add Review
                                                                </button>
                                                            )}
                                                            {ins.reasons.some(r => r.code === 'NO_WALLET') && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ fontSize: 12, padding: '6px 14px', color: '#a78bfa', borderColor: 'rgba(167,139,250,.25)' }}
                                                                    onClick={() => { setActiveTab('workers'); setTimeout(() => toggleWorkerExpand(ins.worker_id), 100); }}
                                                                >
                                                                    Link Wallet
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { Navigation } from '@/components/Navigation';
import { NetworkGuard } from '@/components/NetworkGuard';
import { TxStatus, TxState } from '@/components/TxStatus';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';
import { CONTRACTS, API_URL, IS_DEMO_ADMIN } from '@/config/contracts';
import { formatRelativeTime } from '@/lib/format';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface WorkerInfo { id: number; full_name: string; project: string | null; rate_per_hour: number; rate_per_unit?: number | null; }
interface WorkerTotals { total_proofs: number; work_units_total: number; total_earned: number; }
interface WorkerWindows { hours_7d: number; hours_30d: number; earned_7d: number; earned_30d: number; }
interface RecentReview { rating: number; comment: string | null; reviewer_name: string | null; review_date: string; tags?: string[] | null; review_source?: string | null; }
interface ReviewStats { avg_rating: number | null; count: number; recent: RecentReview[]; }
interface RecentShift { date: string; project: string; hours: number; unit_type: string; units_done: number; rate_per_unit: number; earned: number; quality_score?: number | null; notes: string | null; }
interface WorkHistory { recent_shifts: RecentShift[]; }
interface ProjectSummary { project_id: number; project_name: string; unit_type: string; total_units: number; total_earned: number; log_count: number; }
interface UnitTypeSummary { unit_type: string; total_units: number; total_earned: number; log_count: number; }

interface WorkerSummary {
    linked: boolean;
    message?: string;
    worker?: WorkerInfo;
    totals?: WorkerTotals;
    windows?: WorkerWindows;
    reviews?: ReviewStats;
    history?: WorkHistory;
    by_project?: ProjectSummary[];
    by_unit_type?: UnitTypeSummary[];
    last_activity?: string | null;
}

interface EarningsAnalysis {
    summary: string;
    prediction_30d?: number | null;
    insights: string[];
    recommendations: string[];
}

interface WorkProofEvent { proofId: bigint; worker: string; timestamp: bigint; txHash: string; }

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

const UNIT_LABELS: Record<string, string> = { HOURS: 'hrs', SHIFTS: 'shifts', TASKS: 'tasks', SQFT: 'sq.ft', KM: 'km' };
function unitLabel(ut: string) { return UNIT_LABELS[ut] || ut.toLowerCase(); }
function renderStars(rating: number) { return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating); }
function qualityColor(score: number | null | undefined) {
    if (!score) return 'rgba(163,163,163,.5)';
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function WorkProofsPage() {
    const { address } = useAccount();
    const publicClient = usePublicClient();

    const [workerSummary, setWorkerSummary] = useState<WorkerSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [analysis, setAnalysis] = useState<EarningsAnalysis | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [onChainProofs, setOnChainProofs] = useState<WorkProofEvent[]>([]);
    const [onChainLoading, setOnChainLoading] = useState(false);
    const [showOnChain, setShowOnChain] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'projects' | 'reviews'>('overview');
    const [simulating, setSimulating] = useState(false);
    const [simulateTxState, setSimulateTxState] = useState<TxState>('idle');
    const [simulateError, setSimulateError] = useState('');

    const fetchWorkerSummary = useCallback(async () => {
        if (!address) { setSummaryLoading(false); return; }
        try {
            setSummaryLoading(true);
            const res = await fetch(`${API_URL}/worker/summary?wallet=${address}`);
            if (res.ok) setWorkerSummary(await res.json());
            else setWorkerSummary({ linked: false, message: 'Failed to fetch worker summary' });
        } catch { setWorkerSummary({ linked: false, message: 'Failed to connect to API' }); }
        finally { setSummaryLoading(false); }
    }, [address]);

    const fetchAnalysis = useCallback(async () => {
        if (!address) return;
        try {
            setAnalysisLoading(true);
            const res = await fetch(`${API_URL}/worker/analysis?wallet=${address}`);
            if (res.ok) setAnalysis(await res.json());
        } catch { /* silent */ }
        finally { setAnalysisLoading(false); }
    }, [address]);

    const fetchOnChainProofs = useCallback(async () => {
        if (!address || !publicClient || !CONTRACTS.WorkProof) return;
        try {
            setOnChainLoading(true);
            const currentBlock = await publicClient.getBlockNumber();
            const fromBlock = currentBlock > 2000n ? currentBlock - 2000n : 0n;
            const logs = await publicClient.getLogs({
                address: CONTRACTS.WorkProof as `0x${string}`,
                event: parseAbiItem('event WorkProofSubmitted(uint256 indexed proofId, address indexed worker, bytes32 proofHash, uint256 workUnits, uint256 earnedAmount, uint256 timestamp)'),
                args: { worker: address }, fromBlock, toBlock: 'latest',
            });
            const parsed: WorkProofEvent[] = logs.map(log => ({ proofId: log.args.proofId!, worker: log.args.worker!, timestamp: log.args.timestamp!, txHash: log.transactionHash }));
            parsed.sort((a, b) => Number(b.timestamp - a.timestamp));
            setOnChainProofs(parsed);
        } catch (e) { console.error('On-chain fetch error:', e); }
        finally { setOnChainLoading(false); }
    }, [publicClient, address]);

    useEffect(() => { fetchWorkerSummary(); }, [fetchWorkerSummary]);
    useEffect(() => { if (workerSummary?.linked) fetchAnalysis(); }, [workerSummary?.linked, fetchAnalysis]);
    useEffect(() => { if (showOnChain) fetchOnChainProofs(); }, [showOnChain, fetchOnChainProofs]);

    const handleSimulate = async () => {
        if (!address) return;
        setSimulating(true); setSimulateTxState('pending'); setSimulateError('');
        try {
            const res = await fetch(`${API_URL}/workproof/simulate-full`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: address, num_days: 14 }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Simulation failed' }));
                throw new Error(err.detail || 'Simulation failed');
            }
            const data = await res.json();
            setSimulateTxState('success');
            setSimulateError('');
            // Refresh worker summary immediately to show new data
            await fetchWorkerSummary();
            // Also trigger analysis refresh
            fetchAnalysis();
        } catch (e: any) { setSimulateTxState('error'); setSimulateError(e?.message || 'Error'); }
        finally { setSimulating(false); }
    };

    const s = workerSummary;
    const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '20px 24px' };
    const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '10px 20px', borderRadius: 8, border: 'none', background: active ? 'rgba(99,102,241,.15)' : 'transparent', color: active ? '#818cf8' : 'rgba(163,163,163,.6)', fontSize: 14, fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all .2s' });

    return (
        <div className="container synapse-page">
            <Navigation />
            <NetworkGuard>
                <main>
                    <div className="synapse-page-header">
                        <h1 className="synapse-page-title">Work Proofs &amp; Earnings</h1>
                        <button id="simulate-workproof-btn" className="btn btn-secondary" onClick={handleSimulate} disabled={simulating} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {simulating ? 'Generating...' : s?.linked ? 'Add More Work Data' : 'Quick Demo Setup'}
                        </button>
                    </div>

                    {simulateTxState !== 'idle' && <TxStatus status={simulateTxState} error={simulateError} successMessage="Demo data generated! Work logs, reviews, and earnings are now visible below." />}

                    {/* Smart Suggestions */}
                    {address && <SuggestionsPanel wallet={address} />}

                    {summaryLoading ? (
                        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                            <p className="synapse-body">Loading worker profile...</p>
                        </div>
                    ) : !s?.linked ? (
                        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                            <h2 className="synapse-heading" style={{ marginBottom: 12 }}>Wallet Not Linked</h2>
                            <p className="synapse-body" style={{ marginBottom: 24, color: 'rgba(163,163,163,1)' }}>{s?.message || 'Your wallet is not linked to a worker profile.'}</p>
                            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-primary"
                                    id="quick-demo-setup-btn"
                                    onClick={handleSimulate}
                                    disabled={simulating}
                                    style={{ padding: '14px 28px', fontSize: 16, fontWeight: 600, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 12, cursor: 'pointer', color: '#fff' }}
                                >
                                    {simulating ? 'Setting up demo...' : 'Quick Demo Setup'}
                                </button>
                                <a href="/manager" className="btn btn-secondary" style={{ padding: '14px 28px', fontSize: 16, borderRadius: 12 }}>Go to Manager Portal</a>
                            </div>
                            <p className="synapse-body" style={{ marginTop: 20, fontSize: 13, color: 'rgba(100,100,100,1)', maxWidth: 420, margin: '20px auto 0' }}>
                                <strong>Quick Demo Setup</strong> creates a sample project, links your wallet, and generates 2 weeks of realistic work data with earnings, reviews, and AI analysis.
                            </p>
                            {simulateTxState === 'error' && <p style={{ color: '#ef4444', marginTop: 12 }}>{simulateError}</p>}
                        </div>
                    ) : (
                        <>
                            {/* Worker Banner */}
                            <div style={{ ...cardStyle, marginBottom: 24, background: 'linear-gradient(135deg, rgba(16,185,129,.08) 0%, rgba(6,78,59,.15) 100%)', border: '1px solid rgba(16,185,129,.12)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                    <div>
                                        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{s.worker?.full_name}</h2>
                                        <p style={{ margin: '4px 0 0', color: 'rgba(163,163,163,.8)', fontSize: 14 }}>
                                            {s.worker?.project || 'Unassigned'} &bull; Rate: &#8377;{s.worker?.rate_per_hour || 0}/unit
                                            {s.last_activity && <span> &bull; Last active: {s.last_activity}</span>}
                                        </p>
                                    </div>
                                    {s.reviews?.avg_rating && (
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: 22, color: '#f59e0b' }}>{renderStars(Math.round(s.reviews.avg_rating))}</span>
                                            <p style={{ margin: 0, color: 'rgba(163,163,163,.7)', fontSize: 13 }}>{s.reviews.avg_rating.toFixed(1)} avg ({s.reviews.count} reviews)</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>&#8377;{(s.totals?.total_earned || 0).toLocaleString()}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(163,163,163,.6)', marginTop: 4 }}>Total Earned</div>
                                </div>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: 28, fontWeight: 700 }}>{s.totals?.work_units_total?.toFixed(1) || '0'}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(163,163,163,.6)', marginTop: 4 }}>Total Work Units</div>
                                </div>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: 28, fontWeight: 700 }}>{s.totals?.total_proofs || 0}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(163,163,163,.6)', marginTop: 4 }}>Work Logs</div>
                                </div>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: '#818cf8' }}>&#8377;{(s.windows?.earned_7d || 0).toLocaleString()}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(163,163,163,.6)', marginTop: 4 }}>Earned (7 days)</div>
                                </div>
                            </div>

                            {/* AI Earnings Analysis */}
                            {analysis && (
                                <div style={{ ...cardStyle, marginBottom: 24, background: 'linear-gradient(135deg, rgba(99,102,241,.06) 0%, rgba(16,185,129,.04) 100%)', border: '1px solid rgba(99,102,241,.12)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ fontSize: 14 }}>&#x1F9E0;</span>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#818cf8' }}>AI Earnings Analysis (Groq)</span>
                                        {analysis.prediction_30d != null && (
                                            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,.1)', color: '#10b981', marginLeft: 'auto' }}>
                                                30-day forecast: &#8377;{analysis.prediction_30d.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,.8)' }}>{analysis.summary}</p>
                                    {analysis.insights.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                            {analysis.insights.map((ins, i) => (
                                                <span key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>{ins}</span>
                                            ))}
                                        </div>
                                    )}
                                    {analysis.recommendations.length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            {analysis.recommendations.map((rec, i) => (
                                                <p key={i} style={{ margin: '4px 0', fontSize: 13, color: 'rgba(163,163,163,.7)' }}>{'\u2192'} {rec}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {analysisLoading && <div style={{ ...cardStyle, marginBottom: 24, textAlign: 'center', color: 'rgba(163,163,163,.5)' }}>Loading AI analysis...</div>}

                            {/* Tab Bar */}
                            <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 4, background: 'rgba(255,255,255,.02)', borderRadius: 10 }}>
                                {(['overview', 'logs', 'projects', 'reviews'] as const).map(tab => (
                                    <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(activeTab === tab)}>
                                        {tab === 'overview' ? 'Overview' : tab === 'logs' ? 'Work Logs' : tab === 'projects' ? 'By Project' : 'Reviews'}
                                    </button>
                                ))}
                            </div>

                            {/* ── Overview Tab ── */}
                            {activeTab === 'overview' && (
                                <>
                                    {s.by_unit_type && s.by_unit_type.length > 0 && (
                                        <div style={{ ...cardStyle, marginBottom: 24 }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Earnings by Unit Type</h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                                                {s.by_unit_type.map((ut, i) => (
                                                    <div key={i} style={{ padding: 14, background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,.04)' }}>
                                                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(163,163,163,.5)', marginBottom: 6 }}>{ut.unit_type}</div>
                                                        <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>&#8377;{ut.total_earned.toLocaleString()}</div>
                                                        <div style={{ fontSize: 12, color: 'rgba(163,163,163,.6)', marginTop: 2 }}>{ut.total_units} {unitLabel(ut.unit_type)} &bull; {ut.log_count} logs</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                                        <div style={cardStyle}>
                                            <div style={{ fontSize: 11, color: 'rgba(163,163,163,.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Last 7 Days</div>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>&#8377;{(s.windows?.earned_7d || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 13, color: 'rgba(163,163,163,.6)' }}>{s.windows?.hours_7d?.toFixed(1) || 0} hours worked</div>
                                        </div>
                                        <div style={cardStyle}>
                                            <div style={{ fontSize: 11, color: 'rgba(163,163,163,.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Last 30 Days</div>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>&#8377;{(s.windows?.earned_30d || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 13, color: 'rgba(163,163,163,.6)' }}>{s.windows?.hours_30d?.toFixed(1) || 0} hours worked</div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ── Work Logs Tab ── */}
                            {activeTab === 'logs' && (
                                <div style={{ ...cardStyle, marginBottom: 24, padding: 0, overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Work Log History</h3>
                                    </div>
                                    {(!s.history?.recent_shifts || s.history.recent_shifts.length === 0) ? (
                                        <p style={{ textAlign: 'center', padding: 32, color: 'rgba(163,163,163,.5)' }}>No work logs recorded yet.</p>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                                        {['Date', 'Project', 'Type', 'Units', 'Rate', 'Earned', 'Quality', 'Notes'].map(h => (
                                                            <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Notes' ? 'left' : 'right', color: 'rgba(163,163,163,.5)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {s.history.recent_shifts.map((log, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>{log.date}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{log.project}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,.1)', color: '#818cf8' }}>{log.unit_type}</span>
                                                            </td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{log.units_done} {unitLabel(log.unit_type)}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'rgba(163,163,163,.6)' }}>&#8377;{log.rate_per_unit}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>&#8377;{log.earned.toLocaleString()}</td>
                                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                                {log.quality_score ? <span style={{ color: qualityColor(log.quality_score) }}>{log.quality_score}/100</span> : <span style={{ color: 'rgba(163,163,163,.3)' }}>-</span>}
                                                            </td>
                                                            <td style={{ padding: '10px 14px', color: 'rgba(163,163,163,.5)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.notes || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── By Project Tab ── */}
                            {activeTab === 'projects' && (
                                <div style={{ ...cardStyle, marginBottom: 24, padding: 0, overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Earnings by Project</h3>
                                    </div>
                                    {(!s.by_project || s.by_project.length === 0) ? (
                                        <p style={{ textAlign: 'center', padding: 32, color: 'rgba(163,163,163,.5)' }}>No project data yet.</p>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                                        {['Project', 'Unit Type', 'Total Units', 'Total Earned', 'Logs'].map(h => (
                                                            <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Project' ? 'left' : 'right', color: 'rgba(163,163,163,.5)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {s.by_project.map((proj, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{proj.project_name}</td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,.1)', color: '#818cf8' }}>{proj.unit_type}</span>
                                                            </td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>{proj.total_units} {unitLabel(proj.unit_type)}</td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#10b981', fontWeight: 700, fontSize: 15 }}>&#8377;{proj.total_earned.toLocaleString()}</td>
                                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: 'rgba(163,163,163,.6)' }}>{proj.log_count}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Reviews Tab ── */}
                            {activeTab === 'reviews' && (
                                <div style={{ ...cardStyle, marginBottom: 24 }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Performance Reviews</h3>
                                    {(!s.reviews?.recent || s.reviews.recent.length === 0) ? (
                                        <p style={{ textAlign: 'center', color: 'rgba(163,163,163,.5)' }}>No reviews yet.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {s.reviews.recent.map((r, idx) => (
                                                <div key={idx} style={{ padding: 16, background: 'rgba(255,255,255,.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                                                        <span style={{ color: '#f59e0b', fontSize: 18 }}>{renderStars(r.rating)}</span>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            {r.review_source && (
                                                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: r.review_source === 'system' ? 'rgba(99,102,241,.1)' : 'rgba(245,158,11,.1)', color: r.review_source === 'system' ? '#818cf8' : '#f59e0b' }}>{r.review_source}</span>
                                                            )}
                                                            <span style={{ color: 'rgba(163,163,163,.5)', fontSize: 13 }}>{r.review_date}</span>
                                                        </div>
                                                    </div>
                                                    {r.comment && <p style={{ margin: '0 0 8px', fontSize: 14, color: 'rgba(255,255,255,.8)' }}>&ldquo;{r.comment}&rdquo;</p>}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            {r.tags && r.tags.map((tag, ti) => (
                                                                <span key={ti} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: tag === 'excellent' || tag === 'safe' ? 'rgba(16,185,129,.1)' : tag === 'late' ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)', color: tag === 'excellent' || tag === 'safe' ? '#10b981' : tag === 'late' ? '#ef4444' : 'rgba(163,163,163,.6)' }}>{tag}</span>
                                                            ))}
                                                        </div>
                                                        {r.reviewer_name && <span style={{ fontSize: 13, color: 'rgba(163,163,163,.5)' }}>&mdash; {r.reviewer_name}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* On-Chain Anchor Feed */}
                            <div style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowOnChain(!showOnChain)}>
                                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>On-Chain WorkProof Feed</h3>
                                    <span style={{ fontSize: 13, color: 'rgba(163,163,163,.5)' }}>{showOnChain ? 'Hide' : 'Show'} ({onChainProofs.length} events)</span>
                                </div>
                                {showOnChain && (
                                    <div style={{ marginTop: 16 }}>
                                        {onChainLoading ? (
                                            <p style={{ textAlign: 'center', color: 'rgba(163,163,163,.5)' }}>Loading...</p>
                                        ) : onChainProofs.length === 0 ? (
                                            <p style={{ textAlign: 'center', color: 'rgba(163,163,163,.5)' }}>No on-chain proofs found in recent blocks.</p>
                                        ) : (
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(163,163,163,.5)', fontSize: 11 }}>ID</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(163,163,163,.5)', fontSize: 11 }}>Time</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(163,163,163,.5)', fontSize: 11 }}>TX Hash</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {onChainProofs.map(p => (
                                                        <tr key={p.proofId.toString()} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                                                            <td style={{ padding: '8px 12px' }}>#{p.proofId.toString()}</td>
                                                            <td style={{ padding: '8px 12px', color: 'rgba(163,163,163,.6)' }}>{formatRelativeTime(Number(p.timestamp))}</td>
                                                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{p.txHash.slice(0, 10)}...{p.txHash.slice(-8)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </main>
            </NetworkGuard>
        </div>
    );
}

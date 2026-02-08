'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { Navigation } from '@/components/Navigation';
import { NetworkGuard } from '@/components/NetworkGuard';
import { TxStatus, TxState } from '@/components/TxStatus';
import { CONTRACTS, API_URL, IS_DEMO_ADMIN } from '@/config/contracts';
import { formatRelativeTime } from '@/lib/format';

// Types for worker summary API response
interface WorkerInfo {
    id: string;
    full_name: string;
    project: string | null;
    rate_per_hour: number;
}

interface WorkerTotals {
    total_proofs: number;
    work_units_total: number;
    total_earned: number;
}

interface WorkerWindows {
    hours_7d: number;
    hours_30d: number;
}

interface RecentReview {
    rating: number;
    comment: string | null;
    reviewer_name: string | null;
    review_date: string;
}

interface ReviewStats {
    avg_rating: number | null;
    recent: RecentReview[];
}

interface RecentShift {
    date: string;
    project: string;
    hours: number;
    earned: number;
    notes: string | null;
}

interface WorkHistory {
    recent_shifts: RecentShift[];
}

interface WorkerSummary {
    linked: boolean;
    message?: string;
    worker?: WorkerInfo;
    totals?: WorkerTotals;
    windows?: WorkerWindows;
    reviews?: ReviewStats;
    history?: WorkHistory;
}

// On-chain WorkProof event type
interface WorkProofEvent {
    proofId: bigint;
    worker: string;
    timestamp: bigint;
    txHash: string;
}

export default function WorkProofsPage() {
    const { address } = useAccount();
    const publicClient = usePublicClient();

    // Worker summary state (off-chain data)
    const [workerSummary, setWorkerSummary] = useState<WorkerSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);

    // On-chain proofs state (optional anchor feed)
    const [onChainProofs, setOnChainProofs] = useState<WorkProofEvent[]>([]);
    const [onChainLoading, setOnChainLoading] = useState(false);
    const [showOnChain, setShowOnChain] = useState(false);

    // Simulate state (admin only)
    const [simulating, setSimulating] = useState(false);
    const [simulateTxState, setSimulateTxState] = useState<TxState>('idle');
    const [simulateError, setSimulateError] = useState('');

    // Fetch worker summary from API
    const fetchWorkerSummary = useCallback(async () => {
        if (!address) {
            setSummaryLoading(false);
            return;
        }

        try {
            setSummaryLoading(true);
            const response = await fetch(`${API_URL}/worker/summary?wallet=${address}`);
            if (response.ok) {
                const data = await response.json();
                setWorkerSummary(data);
            } else {
                setWorkerSummary({ linked: false, message: 'Failed to fetch worker summary' });
            }
        } catch (error) {
            console.error('Failed to fetch worker summary:', error);
            setWorkerSummary({ linked: false, message: 'Failed to connect to API' });
        } finally {
            setSummaryLoading(false);
        }
    }, [address]);

    // Fetch on-chain WorkProof events (optional)
    const fetchOnChainProofs = useCallback(async () => {
        if (!address || !publicClient || !CONTRACTS.WorkProof) {
            return;
        }

        try {
            setOnChainLoading(true);
            const currentBlock = await publicClient.getBlockNumber();
            const fromBlock = currentBlock > 2000n ? currentBlock - 2000n : 0n;

            const logs = await publicClient.getLogs({
                address: CONTRACTS.WorkProof as `0x${string}`,
                event: parseAbiItem('event WorkProofSubmitted(uint256 indexed proofId, address indexed worker, bytes32 proofHash, uint256 workUnits, uint256 earnedAmount, uint256 timestamp)'),
                args: { worker: address },
                fromBlock,
                toBlock: 'latest',
            });

            const parsed: WorkProofEvent[] = logs.map((log) => ({
                proofId: log.args.proofId!,
                worker: log.args.worker!,
                timestamp: log.args.timestamp!,
                txHash: log.transactionHash,
            }));

            parsed.sort((a, b) => Number(b.timestamp - a.timestamp));
            setOnChainProofs(parsed);
        } catch (error) {
            console.error('Failed to fetch on-chain proofs:', error);
        } finally {
            setOnChainLoading(false);
        }
    }, [publicClient, address]);

    useEffect(() => {
        fetchWorkerSummary();
    }, [fetchWorkerSummary]);

    useEffect(() => {
        if (showOnChain) {
            fetchOnChainProofs();
        }
    }, [showOnChain, fetchOnChainProofs]);

    // Admin simulate work proof
    const handleSimulate = async () => {
        if (!address) return;

        setSimulating(true);
        setSimulateTxState('pending');
        setSimulateError('');

        try {
            const response = await fetch(`${API_URL}/workproof/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    worker_address: address,
                    work_units: Math.floor(Math.random() * 100) + 10,
                    earned_amount: String((Math.floor(Math.random() * 500) + 100) * 1_000_000),
                    proof_uri: `ipfs://demo/${Date.now()}`,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to simulate work proof');
            }

            setSimulateTxState('success');
            setTimeout(() => {
                fetchWorkerSummary();
            }, 2000);

        } catch (error) {
            console.error('Simulate error:', error);
            setSimulateTxState('error');
            setSimulateError(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setSimulating(false);
        }
    };

    // Render star rating
    const renderStars = (rating: number) => {
        return '★'.repeat(rating) + '☆'.repeat(5 - rating);
    };

    return (
        <div className="container synapse-page">
            <Navigation />

            <NetworkGuard>
                <main>
                    <div className="synapse-page-header">
                        <h1 className="synapse-page-title">Your Work Proofs</h1>

                        {IS_DEMO_ADMIN && (
                            <button
                                className="btn btn-secondary"
                                onClick={handleSimulate}
                                disabled={simulating}
                            >
                                {simulating ? '⏳ Simulating...' : '🔧 Admin: Simulate WorkProof'}
                            </button>
                        )}
                    </div>

                    {simulateTxState !== 'idle' && (
                        <TxStatus
                            status={simulateTxState}
                            error={simulateError}
                            successMessage="Work proof simulated! Refreshing..."
                        />
                    )}

                    {summaryLoading ? (
                        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                            <p className="synapse-body">Loading worker profile...</p>
                        </div>
                    ) : !workerSummary?.linked ? (
                        /* Not Linked State */
                        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                            <h2 className="synapse-heading" style={{ marginBottom: 16 }}>Wallet Not Linked</h2>
                            <p className="synapse-body" style={{ marginBottom: 24, color: 'rgba(163, 163, 163, 1)' }}>
                                {workerSummary?.message || 'Your wallet is not linked to a worker profile.'}
                            </p>
                            <a href="/manager" className="btn btn-primary">
                                Go to Manager Portal
                            </a>
                            <p className="synapse-body" style={{ marginTop: 16, fontSize: 14, color: 'rgba(100, 100, 100, 1)' }}>
                                Or ask your manager to link your wallet address.
                            </p>
                        </div>
                    ) : (
                        /* Linked - Show Full Dashboard */
                        <>
                            {/* Worker Info Banner */}
                            <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(6,78,59,0.2) 100%)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                    <div>
                                        <h2 className="synapse-heading" style={{ marginBottom: 4 }}>
                                            {workerSummary.worker?.full_name}
                                        </h2>
                                        <p className="synapse-body" style={{ color: 'rgba(163, 163, 163, 1)' }}>
                                            {workerSummary.worker?.project || 'Unassigned'} • ₹{workerSummary.worker?.rate_per_hour}/hr
                                        </p>
                                    </div>
                                    {workerSummary.reviews?.avg_rating && (
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: 24, color: 'var(--synapse-gold)' }}>
                                                {renderStars(Math.round(workerSummary.reviews.avg_rating))}
                                            </span>
                                            <p className="synapse-body" style={{ color: 'rgba(163, 163, 163, 1)', fontSize: 14 }}>
                                                {workerSummary.reviews.avg_rating.toFixed(1)} avg rating
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-3" style={{ marginBottom: 40 }}>
                                <div className="card">
                                    <div className="stat">
                                        <div className="stat-value">{workerSummary.totals?.total_proofs || 0}</div>
                                        <div className="stat-label">Total Proofs</div>
                                    </div>
                                </div>
                                <div className="card">
                                    <div className="stat">
                                        <div className="stat-value">{workerSummary.totals?.work_units_total?.toFixed(1) || '0'}</div>
                                        <div className="stat-label">Work Units</div>
                                    </div>
                                </div>
                                <div className="card">
                                    <div className="stat">
                                        <div className="stat-value" style={{ color: 'var(--synapse-emerald)' }}>
                                            ₹{(workerSummary.totals?.total_earned || 0).toLocaleString()}
                                        </div>
                                        <div className="stat-label">Total Earned</div>
                                    </div>
                                </div>
                            </div>

                            {/* Time Windows */}
                            <div className="grid grid-2" style={{ marginBottom: 40 }}>
                                <div className="card">
                                    <div className="stat">
                                        <div className="stat-value">{workerSummary.windows?.hours_7d?.toFixed(1) || '0'}</div>
                                        <div className="stat-label">Hours (Last 7 Days)</div>
                                    </div>
                                </div>
                                <div className="card">
                                    <div className="stat">
                                        <div className="stat-value">{workerSummary.windows?.hours_30d?.toFixed(1) || '0'}</div>
                                        <div className="stat-label">Hours (Last 30 Days)</div>
                                    </div>
                                </div>
                            </div>

                            {/* Work History Table */}
                            <div className="card" style={{ marginBottom: 40 }}>
                                <h2 className="synapse-heading" style={{ marginBottom: 24 }}>Work History</h2>

                                {workerSummary.history?.recent_shifts?.length === 0 ? (
                                    <p className="synapse-body" style={{ textAlign: 'center', color: 'rgba(163, 163, 163, 1)' }}>
                                        No shifts recorded yet.
                                    </p>
                                ) : (
                                    <table className="synapse-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Project</th>
                                                <th className="text-right">Hours</th>
                                                <th className="text-right">Earned</th>
                                                <th>Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {workerSummary.history?.recent_shifts?.map((shift, idx) => (
                                                <tr key={idx}>
                                                    <td>{shift.date}</td>
                                                    <td>{shift.project}</td>
                                                    <td className="text-right">{shift.hours}</td>
                                                    <td className="text-right" style={{ color: 'var(--synapse-emerald)' }}>
                                                        ₹{shift.earned.toLocaleString()}
                                                    </td>
                                                    <td style={{ color: 'rgba(163, 163, 163, 1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {shift.notes || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Performance Reviews */}
                            {workerSummary.reviews?.recent && workerSummary.reviews.recent.length > 0 && (
                                <div className="card" style={{ marginBottom: 40 }}>
                                    <h2 className="synapse-heading" style={{ marginBottom: 24 }}>Performance Reviews</h2>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {workerSummary.reviews.recent.map((review, idx) => (
                                            <div key={idx} style={{
                                                padding: 16,
                                                background: 'rgba(255,255,255,0.02)',
                                                borderRadius: 8,
                                                border: '1px solid rgba(255,255,255,0.1)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span style={{ color: 'var(--synapse-gold)' }}>
                                                        {renderStars(review.rating)}
                                                    </span>
                                                    <span style={{ color: 'rgba(163, 163, 163, 1)', fontSize: 14 }}>
                                                        {review.review_date}
                                                    </span>
                                                </div>
                                                {review.comment && (
                                                    <p className="synapse-body" style={{ marginBottom: 8 }}>
                                                        "{review.comment}"
                                                    </p>
                                                )}
                                                {review.reviewer_name && (
                                                    <p style={{ fontSize: 14, color: 'rgba(163, 163, 163, 1)' }}>
                                                        — {review.reviewer_name}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* On-Chain Anchor Feed (Collapsible) */}
                            <div className="card">
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setShowOnChain(!showOnChain)}
                                >
                                    <h2 className="synapse-heading">On-Chain WorkProof Feed</h2>
                                    <span style={{ fontSize: 14, color: 'rgba(163, 163, 163, 1)' }}>
                                        {showOnChain ? '▼ Hide' : '▶ Show'} ({onChainProofs.length} events)
                                    </span>
                                </div>

                                {showOnChain && (
                                    <div style={{ marginTop: 16 }}>
                                        {onChainLoading ? (
                                            <p className="synapse-body" style={{ textAlign: 'center' }}>
                                                Loading on-chain events...
                                            </p>
                                        ) : onChainProofs.length === 0 ? (
                                            <p className="synapse-body" style={{ textAlign: 'center', color: 'rgba(163, 163, 163, 1)' }}>
                                                No on-chain work proofs found in recent blocks.
                                            </p>
                                        ) : (
                                            <table className="synapse-table">
                                                <thead>
                                                    <tr>
                                                        <th>ID</th>
                                                        <th>Time</th>
                                                        <th>TX Hash</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {onChainProofs.map((proof) => (
                                                        <tr key={proof.proofId.toString()}>
                                                            <td>#{proof.proofId.toString()}</td>
                                                            <td style={{ color: 'rgba(163, 163, 163, 1)' }}>
                                                                {formatRelativeTime(Number(proof.timestamp))}
                                                            </td>
                                                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                                                {proof.txHash.slice(0, 10)}...{proof.txHash.slice(-8)}
                                                            </td>
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

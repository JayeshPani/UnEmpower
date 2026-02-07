'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseAbiItem, decodeEventLog } from 'viem';
import { Navigation } from '@/components/Navigation';
import { NetworkGuard } from '@/components/NetworkGuard';
import { TxStatus, TxState } from '@/components/TxStatus';
import { CONTRACTS, API_URL, IS_DEMO_ADMIN } from '@/config/contracts';
import { WorkProofABI } from '@/config/abis';
import { formatUSDC, formatRelativeTime } from '@/lib/format';

interface WorkProofEvent {
    proofId: bigint;
    worker: string;
    proofHash: string;
    workUnits: bigint;
    earnedAmount: bigint;
    timestamp: bigint;
    blockNumber: bigint;
    txHash: string;
}

export default function WorkProofsPage() {
    const { address } = useAccount();
    const publicClient = usePublicClient();

    const [proofs, setProofs] = useState<WorkProofEvent[]>([]);
    const [stats, setStats] = useState({ totalProofs: 0n, totalWorkUnits: 0n, totalEarned: 0n });
    const [loading, setLoading] = useState(true);
    const [simulating, setSimulating] = useState(false);
    const [simulateTxState, setSimulateTxState] = useState<TxState>('idle');
    const [simulateError, setSimulateError] = useState('');

    // Fetch on-chain events
    const fetchProofs = useCallback(async () => {
        if (!publicClient || !address || !CONTRACTS.WorkProof) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            // Get WorkProofSubmitted events for this worker
            const logs = await publicClient.getLogs({
                address: CONTRACTS.WorkProof as `0x${string}`,
                event: parseAbiItem('event WorkProofSubmitted(uint256 indexed proofId, address indexed worker, bytes32 proofHash, uint256 workUnits, uint256 earnedAmount, uint256 timestamp)'),
                args: {
                    worker: address,
                },
                fromBlock: 0n,
                toBlock: 'latest',
            });

            const parsedProofs: WorkProofEvent[] = logs.map((log) => ({
                proofId: log.args.proofId!,
                worker: log.args.worker!,
                proofHash: log.args.proofHash!,
                workUnits: log.args.workUnits!,
                earnedAmount: log.args.earnedAmount!,
                timestamp: log.args.timestamp!,
                blockNumber: log.blockNumber,
                txHash: log.transactionHash,
            }));

            // Sort newest first
            parsedProofs.sort((a, b) => Number(b.timestamp - a.timestamp));
            setProofs(parsedProofs);

            // Calculate stats
            const totalWorkUnits = parsedProofs.reduce((sum, p) => sum + p.workUnits, 0n);
            const totalEarned = parsedProofs.reduce((sum, p) => sum + p.earnedAmount, 0n);
            setStats({
                totalProofs: BigInt(parsedProofs.length),
                totalWorkUnits,
                totalEarned,
            });

        } catch (error) {
            console.error('Failed to fetch proofs:', error);
        } finally {
            setLoading(false);
        }
    }, [publicClient, address]);

    useEffect(() => {
        fetchProofs();
    }, [fetchProofs]);

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
                    earned_amount: String((Math.floor(Math.random() * 500) + 100) * 1_000_000), // 100-600 USDC
                    proof_uri: `ipfs://demo/${Date.now()}`,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to simulate work proof');
            }

            const data = await response.json();
            setSimulateTxState('success');

            // Refresh proofs after a short delay
            setTimeout(() => {
                fetchProofs();
            }, 2000);

        } catch (error) {
            console.error('Simulate error:', error);
            setSimulateTxState('error');
            setSimulateError(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setSimulating(false);
        }
    };

    return (
        <div className="container">
            <Navigation />

            <NetworkGuard>
                <main style={{ padding: '40px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                        <h1 style={{ fontSize: 32 }}>Your Work Proofs</h1>

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

                    <div className="grid grid-3" style={{ marginBottom: 40 }}>
                        <div className="card">
                            <div className="stat">
                                <div className="stat-value">{stats.totalProofs.toString()}</div>
                                <div className="stat-label">Total Proofs</div>
                            </div>
                        </div>
                        <div className="card">
                            <div className="stat">
                                <div className="stat-value">{stats.totalWorkUnits.toLocaleString()}</div>
                                <div className="stat-label">Work Units</div>
                            </div>
                        </div>
                        <div className="card">
                            <div className="stat">
                                <div className="stat-value">${formatUSDC(stats.totalEarned)}</div>
                                <div className="stat-label">Total Earned</div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <h2 style={{ marginBottom: 24 }}>Work History</h2>

                        {loading ? (
                            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
                                Loading on-chain events...
                            </p>
                        ) : !CONTRACTS.WorkProof ? (
                            <p style={{ color: 'var(--warning)', textAlign: 'center', padding: 40 }}>
                                ⚠️ WorkProof contract not configured
                            </p>
                        ) : proofs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ color: 'var(--text-secondary)' }}>No work proofs found on-chain.</p>
                                {IS_DEMO_ADMIN && (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
                                        Use the Admin button above to simulate a work proof.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '12px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>ID</th>
                                        <th style={{ textAlign: 'left', padding: '12px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>Time</th>
                                        <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>Work Units</th>
                                        <th style={{ textAlign: 'right', padding: '12px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>Earned</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {proofs.map((proof) => (
                                        <tr key={proof.proofId.toString()} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '16px 0' }}>#{proof.proofId.toString()}</td>
                                            <td style={{ padding: '16px 0', color: 'var(--text-secondary)' }}>
                                                {formatRelativeTime(Number(proof.timestamp))}
                                            </td>
                                            <td style={{ padding: '16px 0', textAlign: 'right' }}>
                                                {proof.workUnits.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '16px 0', textAlign: 'right', color: 'var(--success)' }}>
                                                ${formatUSDC(proof.earnedAmount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </main>
            </NetworkGuard>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { Navigation } from '@/components/Navigation';
import { NetworkGuard } from '@/components/NetworkGuard';
import { TxStatus, TxState } from '@/components/TxStatus';
import { CONTRACTS } from '@/config/contracts';
import { WorkerRegistryABI } from '@/config/abis';

export default function RegisterPage() {
    const { address } = useAccount();
    const [name, setName] = useState('');
    const [txState, setTxState] = useState<TxState>('idle');

    // Check if already registered
    const { data: workerData, refetch: refetchWorker } = useReadContract({
        address: CONTRACTS.WorkerRegistry as `0x${string}`,
        abi: WorkerRegistryABI,
        functionName: 'workers',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address && !!CONTRACTS.WorkerRegistry,
        },
    });

    // Write contract hook
    const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();

    // Wait for transaction
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    // Update tx state based on hooks
    useEffect(() => {
        if (isPending) setTxState('pending');
        else if (isConfirming) setTxState('confirming');
        else if (isSuccess) {
            setTxState('success');
            refetchWorker();
        }
        else if (writeError) setTxState('error');
    }, [isPending, isConfirming, isSuccess, writeError, refetchWorker]);

    const isRegistered = workerData && workerData[0] !== '0x0000000000000000000000000000000000000000';
    const registeredName = workerData ? workerData[1] as string : '';

    const handleRegister = async () => {
        if (!name.trim() || !CONTRACTS.WorkerRegistry) return;

        reset();
        setTxState('idle');

        writeContract({
            address: CONTRACTS.WorkerRegistry as `0x${string}`,
            abi: WorkerRegistryABI,
            functionName: 'registerWorker',
            args: [name.trim()],
        });
    };

    return (
        <div className="container synapse-page">
            <Navigation />

            <NetworkGuard>
                <main>
                    <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
                        <h1 className="synapse-heading" style={{ fontSize: 28, marginBottom: 8 }}>
                            Register as Worker
                        </h1>
                        <p className="synapse-body" style={{ marginBottom: 32 }}>
                            Register on the blockchain to start building your work history.
                        </p>

                        {isRegistered ? (
                            <div className="synapse-success-state">
                                <div className="icon">✅</div>
                                <h2>Already Registered!</h2>
                                <p>
                                    Welcome back, <strong>{registeredName}</strong>!
                                </p>
                                <a href="/workproofs" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-block' }}>
                                    View Work Proofs →
                                </a>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: 24 }}>
                                    <label className="label">Your Wallet</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={address || ''}
                                        disabled
                                        style={{ opacity: 0.7 }}
                                    />
                                </div>

                                <div style={{ marginBottom: 32 }}>
                                    <label className="label">Display Name</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="Enter your name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={txState === 'pending' || txState === 'confirming'}
                                    />
                                </div>

                                <button
                                    id="register-btn"
                                    className="btn btn-primary"
                                    style={{ width: '100%' }}
                                    onClick={handleRegister}
                                    disabled={!name.trim() || txState === 'pending' || txState === 'confirming' || !CONTRACTS.WorkerRegistry}
                                >
                                    {txState === 'pending' ? 'Confirm in Wallet...' :
                                        txState === 'confirming' ? 'Confirming...' :
                                            'Register on Chain'}
                                </button>

                                <TxStatus
                                    status={txState}
                                    txHash={txHash}
                                    error={writeError?.message}
                                    successMessage="Successfully registered as a worker!"
                                />

                                {!CONTRACTS.WorkerRegistry && (
                                    <p className="synapse-alert synapse-alert-error" style={{ marginTop: 16, textAlign: 'center', fontSize: 12 }}>
                                        ⚠️ Contract addresses not configured. Please set environment variables.
                                    </p>
                                )}

                                <p className="synapse-body" style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}>
                                    This will create a transaction on the blockchain.
                                </p>
                            </>
                        )}
                    </div>
                </main>
            </NetworkGuard>
        </div>
    );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Navigation } from '@/components/Navigation';
import { NetworkGuard } from '@/components/NetworkGuard';
import { TxStatus, TxState } from '@/components/TxStatus';
import { CONTRACTS, CHAIN_ID } from '@/config/contracts';
import { LoanVaultABI, MockUSDCABI } from '@/config/abis';
import { parseUSDC, formatUSDC, formatBps, formatDate, isExpired } from '@/lib/format';
import Link from 'next/link';

interface Attestation {
    worker: string;
    trustScore: number;
    pd: number;
    creditLimit: string;
    aprBps: number;
    tenureDays: number;
    fraudFlags: number;
    issuedAt: number;
    expiresAt: number;
    nonce: number;
}

interface StoredOffer {
    attestation: Attestation;
    signature: string;
    signer: string;
}

interface Loan {
    borrower: string;
    principal: bigint;
    interestAmount: bigint;
    totalDue: bigint;
    amountRepaid: bigint;
    startTime: bigint;
    dueDate: bigint;
    aprBps: number;
    isActive: boolean;
    isDefaulted: boolean;
}

function getStorageKey(address: string, chainId: number): string {
    return `unempower:offer:${address.toLowerCase()}:${chainId}`;
}

export default function LoanPage() {
    const { address } = useAccount();

    // Form state
    const [borrowAmount, setBorrowAmount] = useState('');
    const [repayAmount, setRepayAmount] = useState('');
    const [storedOffer, setStoredOffer] = useState<StoredOffer | null>(null);
    const [offerExpired, setOfferExpired] = useState(false);

    // TX states
    const [borrowTxState, setBorrowTxState] = useState<TxState>('idle');
    const [approveTxState, setApproveTxState] = useState<TxState>('idle');
    const [repayTxState, setRepayTxState] = useState<TxState>('idle');

    // Read USDC balance
    const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
        address: CONTRACTS.MockUSDC as `0x${string}`,
        abi: MockUSDCABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address && !!CONTRACTS.MockUSDC },
    });

    // Read active loan
    const { data: loanData, refetch: refetchLoan } = useReadContract({
        address: CONTRACTS.LoanVault as `0x${string}`,
        abi: LoanVaultABI,
        functionName: 'getLoan',
        args: address ? [address] : undefined,
        query: { enabled: !!address && !!CONTRACTS.LoanVault },
    });

    // Read allowance
    const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
        address: CONTRACTS.MockUSDC as `0x${string}`,
        abi: MockUSDCABI,
        functionName: 'allowance',
        args: address && CONTRACTS.LoanVault ? [address, CONTRACTS.LoanVault as `0x${string}`] : undefined,
        query: { enabled: !!address && !!CONTRACTS.MockUSDC && !!CONTRACTS.LoanVault },
    });

    // Write hooks
    const { writeContract: writeBorrow, data: borrowTxHash, isPending: isBorrowPending, error: borrowError, reset: resetBorrow } = useWriteContract();
    const { writeContract: writeApprove, data: approveTxHash, isPending: isApprovePending, error: approveError, reset: resetApprove } = useWriteContract();
    const { writeContract: writeRepay, data: repayTxHash, isPending: isRepayPending, error: repayError, reset: resetRepay } = useWriteContract();

    // Wait for tx
    const { isLoading: isBorrowConfirming, isSuccess: isBorrowSuccess } = useWaitForTransactionReceipt({ hash: borrowTxHash });
    const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });
    const { isLoading: isRepayConfirming, isSuccess: isRepaySuccess } = useWaitForTransactionReceipt({ hash: repayTxHash });

    // Load stored offer
    useEffect(() => {
        if (!address) return;
        const key = getStorageKey(address, CHAIN_ID);
        const stored = localStorage.getItem(key);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as StoredOffer;
                setStoredOffer(parsed);
                setOfferExpired(isExpired(parsed.attestation.expiresAt));
            } catch (e) {
                console.error('Failed to parse stored offer:', e);
            }
        }
    }, [address]);

    // Update borrow tx state
    useEffect(() => {
        if (isBorrowPending) setBorrowTxState('pending');
        else if (isBorrowConfirming) setBorrowTxState('confirming');
        else if (isBorrowSuccess) {
            setBorrowTxState('success');
            refetchBalance();
            refetchLoan();
            setBorrowAmount('');
        }
        else if (borrowError) setBorrowTxState('error');
    }, [isBorrowPending, isBorrowConfirming, isBorrowSuccess, borrowError, refetchBalance, refetchLoan]);

    // Update approve tx state
    useEffect(() => {
        if (isApprovePending) setApproveTxState('pending');
        else if (isApproveConfirming) setApproveTxState('confirming');
        else if (isApproveSuccess) {
            setApproveTxState('success');
            refetchAllowance();
        }
        else if (approveError) setApproveTxState('error');
    }, [isApprovePending, isApproveConfirming, isApproveSuccess, approveError, refetchAllowance]);

    // Update repay tx state
    useEffect(() => {
        if (isRepayPending) setRepayTxState('pending');
        else if (isRepayConfirming) setRepayTxState('confirming');
        else if (isRepaySuccess) {
            setRepayTxState('success');
            refetchBalance();
            refetchLoan();
            setRepayAmount('');
        }
        else if (repayError) setRepayTxState('error');
    }, [isRepayPending, isRepayConfirming, isRepaySuccess, repayError, refetchBalance, refetchLoan]);

    // Parse loan data
    const loan: Loan | null = loanData && (loanData as Loan).isActive ? (loanData as Loan) : null;
    const hasActiveLoan = !!loan;
    const remainingDue = loan ? loan.totalDue - loan.amountRepaid : 0n;
    const allowance = (allowanceData as bigint) || 0n;

    // Borrow handler
    const handleBorrow = () => {
        if (!storedOffer || !address || !CONTRACTS.LoanVault) return;

        const amountBigInt = parseUSDC(borrowAmount);
        if (amountBigInt <= 0n) return;

        resetBorrow();
        setBorrowTxState('idle');

        // Build attestation struct for contract
        const attestationStruct = {
            worker: storedOffer.attestation.worker as `0x${string}`,
            trustScore: storedOffer.attestation.trustScore,
            pd: storedOffer.attestation.pd,
            creditLimit: BigInt(storedOffer.attestation.creditLimit),
            aprBps: storedOffer.attestation.aprBps,
            tenureDays: storedOffer.attestation.tenureDays,
            fraudFlags: storedOffer.attestation.fraudFlags,
            issuedAt: BigInt(storedOffer.attestation.issuedAt),
            expiresAt: BigInt(storedOffer.attestation.expiresAt),
            nonce: BigInt(storedOffer.attestation.nonce),
        };

        writeBorrow({
            address: CONTRACTS.LoanVault as `0x${string}`,
            abi: LoanVaultABI,
            functionName: 'requestLoan',
            args: [amountBigInt, attestationStruct, storedOffer.signature as `0x${string}`],
        });
    };

    // Approve handler
    const handleApprove = () => {
        if (!CONTRACTS.MockUSDC || !CONTRACTS.LoanVault) return;

        const amountBigInt = parseUSDC(repayAmount);
        if (amountBigInt <= 0n) return;

        resetApprove();
        setApproveTxState('idle');

        writeApprove({
            address: CONTRACTS.MockUSDC as `0x${string}`,
            abi: MockUSDCABI,
            functionName: 'approve',
            args: [CONTRACTS.LoanVault as `0x${string}`, amountBigInt],
        });
    };

    // Repay handler
    const handleRepay = () => {
        if (!CONTRACTS.LoanVault) return;

        const amountBigInt = parseUSDC(repayAmount);
        if (amountBigInt <= 0n) return;

        resetRepay();
        setRepayTxState('idle');

        writeRepay({
            address: CONTRACTS.LoanVault as `0x${string}`,
            abi: LoanVaultABI,
            functionName: 'repay',
            args: [amountBigInt],
        });
    };

    // Repay full amount
    const handleRepayFull = () => {
        if (loan) {
            setRepayAmount(formatUSDC(remainingDue).replace(/,/g, ''));
        }
    };

    const repayAmountBigInt = parseUSDC(repayAmount);
    const needsApproval = repayAmountBigInt > allowance;

    return (
        <div className="container synapse-page">
            <Navigation />

            <NetworkGuard>
                <main>
                    <h1 className="synapse-page-title" style={{ marginBottom: 32 }}>Loan Management</h1>

                    {/* USDC Balance */}
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div className="synapse-body" style={{ fontSize: 14 }}>Your mUSDC Balance</div>
                                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: '#fff' }}>
                                    ${formatUSDC(usdcBalance as bigint || 0n)}
                                </div>
                            </div>
                            {!CONTRACTS.MockUSDC && (
                                <span style={{ color: 'var(--warning)', fontSize: 12 }}>⚠️ Contract not configured</span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-2">
                        {/* Borrow Section */}
                        <div className="card">
                            <h2 className="synapse-heading" style={{ marginBottom: 24 }}>Borrow</h2>

                            {hasActiveLoan ? (
                                <div className="synapse-alert synapse-alert-warning" style={{ textAlign: 'center', padding: 20 }}>
                                    ⚠️ You have an active loan. Repay it before borrowing more.
                                </div>
                            ) : !storedOffer ? (
                                <div className="synapse-empty">
                                    <p className="synapse-empty-text" style={{ marginBottom: 16 }}>
                                        You need a credit offer to borrow.
                                    </p>
                                    <Link href="/offer" className="btn btn-primary">
                                        Get Offer →
                                    </Link>
                                </div>
                            ) : offerExpired ? (
                                <div className="synapse-empty">
                                    <p style={{ color: 'var(--error)', marginBottom: 16 }}>
                                        ⏱️ Your offer has expired.
                                    </p>
                                    <Link href="/offer" className="btn btn-primary">
                                        Get New Offer
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <div className="synapse-info-box">
                                        <div className="synapse-info-row">
                                            <span>Credit Limit</span>
                                            <span>${formatUSDC(BigInt(storedOffer.attestation.creditLimit))}</span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>APR</span>
                                            <span>{formatBps(storedOffer.attestation.aprBps)}</span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>Max Tenure</span>
                                            <span>{storedOffer.attestation.tenureDays} days</span>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 24 }}>
                                        <label className="label">Borrow Amount (USDC)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            placeholder="100.00"
                                            value={borrowAmount}
                                            onChange={(e) => setBorrowAmount(e.target.value)}
                                            min="1"
                                            step="0.01"
                                            disabled={borrowTxState === 'pending' || borrowTxState === 'confirming'}
                                        />
                                    </div>

                                    <button
                                        id="borrow-btn"
                                        className="btn btn-primary"
                                        style={{ width: '100%' }}
                                        onClick={handleBorrow}
                                        disabled={
                                            !borrowAmount ||
                                            parseUSDC(borrowAmount) <= 0n ||
                                            parseUSDC(borrowAmount) > BigInt(storedOffer.attestation.creditLimit) ||
                                            borrowTxState === 'pending' ||
                                            borrowTxState === 'confirming'
                                        }
                                    >
                                        {borrowTxState === 'pending' ? 'Confirm in Wallet...' :
                                            borrowTxState === 'confirming' ? 'Confirming...' :
                                                'Request Loan'}
                                    </button>

                                    <TxStatus
                                        status={borrowTxState}
                                        txHash={borrowTxHash}
                                        error={borrowError?.message}
                                        successMessage="Loan approved! Funds transferred."
                                    />
                                </>
                            )}
                        </div>

                        {/* Repay Section */}
                        <div className="card">
                            <h2 className="synapse-heading" style={{ marginBottom: 24 }}>Active Loan</h2>

                            {loan ? (
                                <>
                                    <div className="synapse-info-box" style={{ marginBottom: 16 }}>
                                        <div className="synapse-info-row">
                                            <span>Principal</span>
                                            <span>${formatUSDC(loan.principal)}</span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>Interest</span>
                                            <span>${formatUSDC(loan.interestAmount)}</span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>Total Due</span>
                                            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                                                ${formatUSDC(loan.totalDue)}
                                            </span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>Repaid</span>
                                            <span style={{ color: 'var(--synapse-emerald)' }}>${formatUSDC(loan.amountRepaid)}</span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>Remaining</span>
                                            <span style={{ fontWeight: 700 }}>${formatUSDC(remainingDue)}</span>
                                        </div>
                                        <div className="synapse-info-row">
                                            <span>Due Date</span>
                                            <span>{formatDate(Number(loan.dueDate))}</span>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="synapse-progress">
                                        <div
                                            className="synapse-progress-bar"
                                            style={{ width: `${Number((loan.amountRepaid * 100n) / loan.totalDue)}%` }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <label className="label" style={{ margin: 0 }}>Repay Amount (USDC)</label>
                                            <button
                                                onClick={handleRepayFull}
                                                className="synapse-max-btn"
                                            >
                                                Max: ${formatUSDC(remainingDue)}
                                            </button>
                                        </div>
                                        <input
                                            type="number"
                                            className="input"
                                            placeholder="50.00"
                                            value={repayAmount}
                                            onChange={(e) => setRepayAmount(e.target.value)}
                                            min="0.01"
                                            step="0.01"
                                            disabled={
                                                approveTxState === 'pending' || approveTxState === 'confirming' ||
                                                repayTxState === 'pending' || repayTxState === 'confirming'
                                            }
                                        />
                                    </div>

                                    {needsApproval ? (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ width: '100%' }}
                                            onClick={handleApprove}
                                            disabled={
                                                !repayAmount ||
                                                repayAmountBigInt <= 0n ||
                                                approveTxState === 'pending' ||
                                                approveTxState === 'confirming'
                                            }
                                        >
                                            {approveTxState === 'pending' ? 'Confirm Approval...' :
                                                approveTxState === 'confirming' ? 'Approving...' :
                                                    `Step 1: Approve ${repayAmount || '0'} USDC`}
                                        </button>
                                    ) : (
                                        <button
                                            id="repay-btn"
                                            className="btn btn-primary"
                                            style={{ width: '100%' }}
                                            onClick={handleRepay}
                                            disabled={
                                                !repayAmount ||
                                                repayAmountBigInt <= 0n ||
                                                repayTxState === 'pending' ||
                                                repayTxState === 'confirming'
                                            }
                                        >
                                            {repayTxState === 'pending' ? 'Confirm in Wallet...' :
                                                repayTxState === 'confirming' ? 'Confirming...' :
                                                    'Repay'}
                                        </button>
                                    )}

                                    <TxStatus
                                        status={approveTxState}
                                        txHash={approveTxHash}
                                        error={approveError?.message}
                                        successMessage="Approved! Now click Repay."
                                    />

                                    <TxStatus
                                        status={repayTxState}
                                        txHash={repayTxHash}
                                        error={repayError?.message}
                                        successMessage="Repayment successful!"
                                    />
                                </>
                            ) : (
                                <div className="synapse-success-state">
                                    <div className="icon">✅</div>
                                    <h2>No active loan</h2>
                                    <p>You're all clear! Borrow when you need funds.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Simulated Payout Notice */}
                    <div className="card" style={{ marginTop: 32 }}>
                        <h3 className="synapse-heading" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            📱 Payout Simulation (Demo)
                        </h3>
                        <p className="synapse-body" style={{ lineHeight: 1.6 }}>
                            In the production version, successful loan approvals would trigger an instant UPI payout to your linked bank account.
                            For this hackathon demo, payouts are simulated and logged in the backend.
                            The event-driven architecture is fully implemented and ready for real payment integration.
                        </p>
                    </div>
                </main>
            </NetworkGuard>
        </div>
    );
}

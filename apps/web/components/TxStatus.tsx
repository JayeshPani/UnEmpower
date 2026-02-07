'use client';

import { getExplorerUrl } from '@/config/wagmi';

export type TxState = 'idle' | 'pending' | 'confirming' | 'success' | 'error';

interface TxStatusProps {
    status: TxState;
    txHash?: string;
    error?: string;
    successMessage?: string;
}

export function TxStatus({ status, txHash, error, successMessage }: TxStatusProps) {
    if (status === 'idle') return null;

    const explorerUrl = txHash ? getExplorerUrl(txHash) : '';

    return (
        <div className={`tx-status tx-status-${status}`}>
            {status === 'pending' && (
                <>
                    <div className="tx-spinner" />
                    <span>Waiting for wallet confirmation...</span>
                </>
            )}

            {status === 'confirming' && (
                <>
                    <div className="tx-spinner" />
                    <span>Confirming transaction...</span>
                    {txHash && explorerUrl && (
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-link">
                            View on Explorer ↗
                        </a>
                    )}
                </>
            )}

            {status === 'success' && (
                <>
                    <span className="tx-icon">✅</span>
                    <span>{successMessage || 'Transaction confirmed!'}</span>
                    {txHash && explorerUrl && (
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-link">
                            View on Explorer ↗
                        </a>
                    )}
                </>
            )}

            {status === 'error' && (
                <>
                    <span className="tx-icon">❌</span>
                    <span>{error || 'Transaction failed'}</span>
                </>
            )}

            <style jsx>{`
                .tx-status {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    border-radius: 8px;
                    margin-top: 16px;
                    font-size: 14px;
                }

                .tx-status-pending,
                .tx-status-confirming {
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    color: #818cf8;
                }

                .tx-status-success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .tx-status-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .tx-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid currentColor;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                .tx-icon {
                    font-size: 16px;
                }

                .tx-link {
                    margin-left: auto;
                    color: inherit;
                    opacity: 0.8;
                    text-decoration: none;
                }

                .tx-link:hover {
                    opacity: 1;
                    text-decoration: underline;
                }

                @keyframes spin {
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
        </div>
    );
}

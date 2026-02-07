'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { isCorrectChain, getTargetChainName, getTargetChainId } from '@/config/wagmi';

interface NetworkGuardProps {
    children: React.ReactNode;
}

export function NetworkGuard({ children }: NetworkGuardProps) {
    const { isConnected, chainId } = useAccount();
    const { switchChain, isPending } = useSwitchChain();

    // Fix hydration mismatch - only check connection state after client mount
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // During SSR or before mount, render a loading placeholder
    if (!mounted) {
        return (
            <div className="network-guard">
                <div className="guard-icon">⏳</div>
                <h3>Loading...</h3>
                <p>Checking wallet connection...</p>

                <style jsx>{`
                    .network-guard {
                        text-align: center;
                        padding: 60px 20px;
                        background: var(--bg-secondary);
                        border: 1px solid var(--border);
                        border-radius: 12px;
                        max-width: 400px;
                        margin: 40px auto;
                    }

                    .guard-icon {
                        font-size: 48px;
                        margin-bottom: 16px;
                    }

                    h3 {
                        font-size: 20px;
                        margin-bottom: 8px;
                    }

                    p {
                        color: var(--text-secondary);
                    }
                `}</style>
            </div>
        );
    }

    // If not connected, show connect message
    if (!isConnected) {
        return (
            <div className="network-guard">
                <div className="guard-icon">🔗</div>
                <h3>Connect Wallet</h3>
                <p>Please connect your wallet to continue.</p>

                <style jsx>{`
                    .network-guard {
                        text-align: center;
                        padding: 60px 20px;
                        background: var(--bg-secondary);
                        border: 1px solid var(--border);
                        border-radius: 12px;
                        max-width: 400px;
                        margin: 40px auto;
                    }

                    .guard-icon {
                        font-size: 48px;
                        margin-bottom: 16px;
                    }

                    h3 {
                        font-size: 20px;
                        margin-bottom: 8px;
                    }

                    p {
                        color: var(--text-secondary);
                    }
                `}</style>
            </div>
        );
    }

    // If wrong chain, show switch button
    if (!isCorrectChain(chainId)) {
        const targetChainId = getTargetChainId();

        return (
            <div className="network-guard">
                <div className="guard-icon">⚠️</div>
                <h3>Wrong Network</h3>
                <p>Please switch to {getTargetChainName()} to continue.</p>
                <button
                    className="btn btn-primary"
                    onClick={() => switchChain({ chainId: targetChainId })}
                    disabled={isPending}
                    style={{ marginTop: 20 }}
                >
                    {isPending ? 'Switching...' : `Switch to ${getTargetChainName()}`}
                </button>

                <style jsx>{`
                    .network-guard {
                        text-align: center;
                        padding: 60px 20px;
                        background: var(--bg-secondary);
                        border: 1px solid var(--border);
                        border-radius: 12px;
                        max-width: 400px;
                        margin: 40px auto;
                    }

                    .guard-icon {
                        font-size: 48px;
                        margin-bottom: 16px;
                    }

                    h3 {
                        font-size: 20px;
                        margin-bottom: 8px;
                    }

                    p {
                        color: var(--text-secondary);
                    }
                `}</style>
            </div>
        );
    }

    // All good, render children
    return <>{children}</>;
}

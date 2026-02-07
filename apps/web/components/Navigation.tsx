'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortenAddress } from '@/lib/format';
import { isCorrectChain, getTargetChainName } from '@/config/wagmi';

export function Navigation() {
    const pathname = usePathname();
    const { address, isConnected, chainId } = useAccount();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();

    // Fix hydration mismatch - only render wallet state after client mount
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const isActive = (path: string) => pathname === path;
    const isWrongChain = isConnected && !isCorrectChain(chainId);

    return (
        <nav className="nav">
            <Link href="/" className="nav-logo">
                UnEmpower
            </Link>

            <div className="nav-links">
                <Link href="/register" className={`nav-link ${isActive('/register') ? 'active' : ''}`}>
                    Register
                </Link>
                <Link href="/workproofs" className={`nav-link ${isActive('/workproofs') ? 'active' : ''}`}>
                    Work Proofs
                </Link>
                <Link href="/offer" className={`nav-link ${isActive('/offer') ? 'active' : ''}`}>
                    Get Offer
                </Link>
                <Link href="/loan" className={`nav-link ${isActive('/loan') ? 'active' : ''}`}>
                    Loan
                </Link>
            </div>

            <div className="nav-wallet">
                {!mounted ? (
                    // Render placeholder during SSR to match initial client render
                    <button className="btn btn-primary" disabled>
                        Loading...
                    </button>
                ) : isConnected ? (
                    <div className="wallet-info">
                        {isWrongChain && (
                            <span className="chain-warning">⚠️ Wrong Network</span>
                        )}
                        <button className="btn btn-secondary" onClick={() => disconnect()}>
                            {shortenAddress(address || '')}
                        </button>
                    </div>
                ) : (
                    <button
                        className="btn btn-primary"
                        onClick={() => connect({ connector: connectors[0] })}
                    >
                        Connect Wallet
                    </button>
                )}
            </div>

            <style jsx>{`
                .nav {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px 0;
                    border-bottom: 1px solid var(--border);
                    margin-bottom: 40px;
                }

                .nav-logo {
                    font-size: 24px;
                    font-weight: 800;
                    background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    text-decoration: none;
                }

                .nav-links {
                    display: flex;
                    gap: 32px;
                }

                .nav-link {
                    color: var(--text-secondary);
                    font-weight: 500;
                    text-decoration: none;
                    transition: color 0.2s ease;
                }

                .nav-link:hover,
                .nav-link.active {
                    color: var(--text-primary);
                }

                .nav-wallet {
                    display: flex;
                    align-items: center;
                }

                .wallet-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .chain-warning {
                    font-size: 12px;
                    color: var(--warning);
                }

                @media (max-width: 768px) {
                    .nav {
                        flex-wrap: wrap;
                        gap: 16px;
                    }

                    .nav-links {
                        order: 3;
                        width: 100%;
                        justify-content: center;
                        gap: 16px;
                    }
                }
            `}</style>
        </nav>
    );
}

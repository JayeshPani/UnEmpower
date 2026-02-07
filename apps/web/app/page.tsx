'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi';
import { Navigation } from '@/components/Navigation';
import { CONTRACTS } from '@/config/contracts';
import { MockUSDCABI } from '@/config/abis';
import { formatUSDC } from '@/lib/format';

export default function Home() {
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();

    // Fix hydration mismatch - only render wallet-dependent UI after client mount
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Check USDC balance if connected
    const { data: usdcBalance } = useReadContract({
        address: CONTRACTS.MockUSDC as `0x${string}`,
        abi: MockUSDCABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address && !!CONTRACTS.MockUSDC },
    });

    return (
        <div className="container">
            <Navigation />

            <main className="hero">
                <div className="hero-content">
                    <h1 className="hero-title">
                        <span className="gradient-text">UnEmpower</span>
                    </h1>
                    <p className="hero-subtitle">
                        AI-First, Blockchain-Enforced Worker Lending
                    </p>
                    <p className="hero-description">
                        Build your on-chain work history, get AI-powered credit scoring,
                        and access instant loans with transparent, verifiable terms.
                    </p>

                    {!mounted ? (
                        <div className="hero-actions">
                            <button className="btn btn-primary btn-large" disabled>
                                Loading...
                            </button>
                        </div>
                    ) : isConnected ? (
                        <div className="hero-connected">
                            <div className="balance-card">
                                <span style={{ color: 'var(--text-secondary)' }}>Your mUSDC Balance</span>
                                <span style={{ fontSize: 24, fontWeight: 700 }}>
                                    ${formatUSDC(usdcBalance as bigint || 0n)}
                                </span>
                            </div>

                            <div className="hero-actions">
                                <Link href="/register" className="btn btn-primary">
                                    Get Started →
                                </Link>
                                <Link href="/loan" className="btn btn-secondary">
                                    Manage Loan
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="hero-actions">
                            <button
                                className="btn btn-primary btn-large"
                                onClick={() => connect({ connector: connectors[0] })}
                            >
                                Connect Wallet
                            </button>
                        </div>
                    )}
                </div>

                <div className="features">
                    <div className="feature-card">
                        <div className="feature-icon">📊</div>
                        <h3>Work Proofs</h3>
                        <p>Your work history stored immutably on-chain as verifiable proofs.</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🤖</div>
                        <h3>AI Scoring</h3>
                        <p>Machine learning analyzes your history to generate fair credit terms.</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🔐</div>
                        <h3>EIP-712 Signed</h3>
                        <p>Cryptographically signed attestations ensure tamper-proof offers.</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">⚡</div>
                        <h3>Instant Loans</h3>
                        <p>Borrow against your attestation in a single on-chain transaction.</p>
                    </div>
                </div>

                <div className="how-it-works">
                    <h2>How It Works</h2>
                    <div className="steps">
                        <div className="step">
                            <div className="step-number">1</div>
                            <div className="step-content">
                                <h4>Register</h4>
                                <p>Connect wallet and register as a worker</p>
                            </div>
                        </div>
                        <div className="step-arrow">→</div>
                        <div className="step">
                            <div className="step-number">2</div>
                            <div className="step-content">
                                <h4>Build History</h4>
                                <p>Accumulate verified work proofs</p>
                            </div>
                        </div>
                        <div className="step-arrow">→</div>
                        <div className="step">
                            <div className="step-number">3</div>
                            <div className="step-content">
                                <h4>Get Offer</h4>
                                <p>AI generates your credit attestation</p>
                            </div>
                        </div>
                        <div className="step-arrow">→</div>
                        <div className="step">
                            <div className="step-number">4</div>
                            <div className="step-content">
                                <h4>Borrow</h4>
                                <p>Request loan with signed attestation</p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <style jsx>{`
                .hero {
                    padding: 60px 0;
                    text-align: center;
                }

                .hero-title {
                    font-size: 64px;
                    font-weight: 800;
                    margin-bottom: 16px;
                }

                .hero-subtitle {
                    font-size: 24px;
                    color: var(--text-secondary);
                    margin-bottom: 16px;
                }

                .hero-description {
                    max-width: 600px;
                    margin: 0 auto 40px;
                    color: var(--text-secondary);
                    line-height: 1.6;
                }

                .hero-connected {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 24px;
                }

                .balance-card {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 24px 48px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                }

                .hero-actions {
                    display: flex;
                    gap: 16px;
                    justify-content: center;
                }

                .btn-large {
                    font-size: 18px;
                    padding: 16px 48px;
                }

                .features {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 24px;
                    margin-top: 80px;
                }

                .feature-card {
                    padding: 32px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    text-align: center;
                }

                .feature-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                }

                .feature-card h3 {
                    font-size: 18px;
                    margin-bottom: 8px;
                }

                .feature-card p {
                    color: var(--text-secondary);
                    font-size: 14px;
                    line-height: 1.5;
                }

                .how-it-works {
                    margin-top: 80px;
                    padding: 48px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                }

                .how-it-works h2 {
                    font-size: 28px;
                    margin-bottom: 40px;
                }

                .steps {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 24px;
                }

                .step {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .step-number {
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                }

                .step-content {
                    text-align: left;
                }

                .step h4 {
                    font-size: 16px;
                    margin-bottom: 4px;
                }

                .step p {
                    font-size: 12px;
                    color: var(--text-secondary);
                }

                .step-arrow {
                    color: var(--text-secondary);
                    font-size: 24px;
                }

                @media (max-width: 1024px) {
                    .features {
                        grid-template-columns: repeat(2, 1fr);
                    }

                    .steps {
                        flex-wrap: wrap;
                    }

                    .step-arrow {
                        display: none;
                    }
                }

                @media (max-width: 640px) {
                    .hero-title {
                        font-size: 40px;
                    }

                    .features {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}

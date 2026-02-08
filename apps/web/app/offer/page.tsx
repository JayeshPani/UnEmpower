'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Navigation } from '@/components/Navigation';
import { NetworkGuard } from '@/components/NetworkGuard';
import { API_URL, CHAIN_ID } from '@/config/contracts';
import { formatUSDC, formatBps, formatCountdown, isExpired } from '@/lib/format';
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

interface OfferData {
    attestation: Attestation;
    signature: string;
    signer: string;
    explanation: string;
}

// Storage key helper
function getStorageKey(address: string, chainId: number): string {
    return `unempower:offer:${address.toLowerCase()}:${chainId}`;
}

export default function OfferPage() {
    const { address } = useAccount();
    const [offer, setOffer] = useState<OfferData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [timeLeft, setTimeLeft] = useState('');
    const [expired, setExpired] = useState(false);

    // Load existing offer from localStorage on mount
    useEffect(() => {
        if (!address) return;

        const stored = localStorage.getItem(getStorageKey(address, CHAIN_ID));
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as OfferData;
                // Check if not expired
                if (!isExpired(parsed.attestation.expiresAt)) {
                    setOffer(parsed);
                } else {
                    // Clear expired offer
                    localStorage.removeItem(getStorageKey(address, CHAIN_ID));
                }
            } catch (e) {
                console.error('Failed to parse stored offer:', e);
            }
        }
    }, [address]);

    // Update countdown timer
    useEffect(() => {
        if (!offer) return;

        const updateTimer = () => {
            const remaining = formatCountdown(offer.attestation.expiresAt);
            setTimeLeft(remaining);
            setExpired(isExpired(offer.attestation.expiresAt));
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [offer]);

    const generateOffer = async () => {
        if (!address) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/ai/offer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ worker_address: address }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to generate offer');
            }

            const data = await res.json() as OfferData;
            setOffer(data);

            // Save to localStorage (convert BigInt-safe)
            const storageData = {
                ...data,
                attestation: {
                    ...data.attestation,
                    creditLimit: data.attestation.creditLimit.toString(),
                },
            };
            localStorage.setItem(getStorageKey(address, CHAIN_ID), JSON.stringify(storageData));

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate offer');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const clearOffer = () => {
        if (!address) return;
        localStorage.removeItem(getStorageKey(address, CHAIN_ID));
        setOffer(null);
    };

    return (
        <div className="container synapse-page">
            <Navigation />

            <NetworkGuard>
                <main>
                    <h1 className="synapse-page-title" style={{ marginBottom: 32 }}>Get Your Credit Offer</h1>

                    {!offer ? (
                        <div className="card synapse-ai-card" style={{ maxWidth: 600, margin: '0 auto' }}>
                            <div className="synapse-ai-card-icon">🤖</div>
                            <h2 className="synapse-ai-card-title">Credit Analysis</h2>
                            <p className="synapse-ai-card-text">
                                Our AI will analyze your on-chain work history and generate a personalized credit offer.
                            </p>

                            {error && (
                                <div className="synapse-alert synapse-alert-error" style={{ marginBottom: 24 }}>
                                    {error}
                                </div>
                            )}

                            <button
                                id="generate-offer-btn"
                                className="btn btn-primary"
                                onClick={generateOffer}
                                disabled={loading}
                                style={{ fontSize: 16, padding: '16px 48px' }}
                            >
                                {loading ? 'Analyzing...' : 'Generate My Offer'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ maxWidth: 700, margin: '0 auto' }}>
                            <div className="card" style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                    <h2 className="synapse-heading">Your Credit Offer</h2>
                                    <div
                                        className={!expired ? 'synapse-pulse' : ''}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            color: expired ? 'var(--error)' : 'var(--warning)',
                                        }}
                                    >
                                        ⏱️ {expired ? 'EXPIRED' : `Expires in ${timeLeft}`}
                                    </div>
                                </div>

                                <div className="grid grid-3" style={{ marginBottom: 32 }}>
                                    <div className="stat">
                                        <div className="stat-value" style={{ color: 'var(--synapse-emerald)' }}>
                                            ${formatUSDC(BigInt(offer.attestation.creditLimit))}
                                        </div>
                                        <div className="stat-label">Credit Limit</div>
                                    </div>
                                    <div className="stat">
                                        <div className="stat-value">
                                            {formatBps(offer.attestation.aprBps)}
                                        </div>
                                        <div className="stat-label">APR</div>
                                    </div>
                                    <div className="stat">
                                        <div className="stat-value">
                                            {offer.attestation.tenureDays}
                                        </div>
                                        <div className="stat-label">Max Days</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                                    <span className="badge badge-success">
                                        Trust Score: {offer.attestation.trustScore}/10000
                                    </span>
                                    <span className="badge badge-warning">
                                        PD: {(offer.attestation.pd / 10000).toFixed(2)}%
                                    </span>
                                    {offer.attestation.fraudFlags > 0 && (
                                        <span className="badge badge-error">
                                            ⚠️ Fraud Flags: {offer.attestation.fraudFlags}
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <Link
                                        href="/loan"
                                        className="btn btn-primary"
                                        style={{
                                            flex: 1,
                                            pointerEvents: expired ? 'none' : 'auto',
                                            opacity: expired ? 0.5 : 1,
                                        }}
                                    >
                                        {expired ? 'Offer Expired' : 'Proceed to Borrow →'}
                                    </Link>
                                    <button className="btn btn-secondary" onClick={clearOffer}>
                                        Get New Offer
                                    </button>
                                </div>
                            </div>

                            <div className="card">
                                <h3 className="synapse-heading" style={{ marginBottom: 16 }}>AI Explanation</h3>
                                <pre className="synapse-body" style={{
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: 'inherit',
                                    lineHeight: 1.6,
                                    margin: 0,
                                }}>
                                    {offer.explanation}
                                </pre>
                            </div>

                            <div className="card" style={{ marginTop: 24 }}>
                                <h3 className="synapse-heading" style={{ marginBottom: 16 }}>Technical Details</h3>
                                <div className="synapse-mono">
                                    <p><strong>Signer:</strong> {offer.signer}</p>
                                    <p style={{ marginTop: 8 }}><strong>Nonce:</strong> {offer.attestation.nonce}</p>
                                    <p style={{ marginTop: 8 }}><strong>Chain ID:</strong> {CHAIN_ID}</p>
                                    <p style={{ marginTop: 8, wordBreak: 'break-all' }}>
                                        <strong>Signature:</strong> {offer.signature.slice(0, 66)}...
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </NetworkGuard>
        </div>
    );
}

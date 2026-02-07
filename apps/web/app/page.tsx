'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useReadContract } from 'wagmi';
import { Navigation } from '@/components/Navigation';
import { ShinyBorderButton } from '@/components/ShinyBorderButton';
import { MetricsTicker } from '@/components/MetricsTicker';
import { FeatureCard } from '@/components/FeatureCard';
import { CodeBlock } from '@/components/CodeBlock';
import { Footer } from '@/components/Footer';
import { CONTRACTS } from '@/config/contracts';
import { MockUSDCABI } from '@/config/abis';
import { formatUSDC } from '@/lib/format';

const FEATURES = [
  {
    icon: '📊',
    title: 'Work Proofs',
    description:
      'Your work history stored immutably on-chain as verifiable proofs.',
    delay: 0,
  },
  {
    icon: '🤖',
    title: 'AI Scoring',
    description:
      'Machine learning analyzes your history to generate fair credit terms.',
    delay: 100,
  },
  {
    icon: '🔐',
    title: 'EIP-712 Signed',
    description:
      'Cryptographically signed attestations ensure tamper-proof offers.',
    delay: 200,
  },
  {
    icon: '⚡',
    title: 'Instant Loans',
    description:
      'Borrow against your attestation in a single on-chain transaction.',
    delay: 300,
  },
];

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.MockUSDC as `0x${string}`,
    abi: MockUSDCABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!CONTRACTS.MockUSDC },
  });

  return (
    <>
      <Navigation />

      {/* Hero */}
      <section className="synapse-hero">
        <div className="synapse-hero-orbs">
          <div className="synapse-orb synapse-orb-violet" style={{ top: '10%', left: '50%' }} />
          <div className="synapse-orb synapse-orb-cyan" style={{ top: '30%', left: '15%' }} />
        </div>

        <div className="synapse-hero-inner">
          <h1 className="synapse-heading-lg synapse-stagger-1">
            UnEmpower{' '}
            <span className="synapse-text-shimmer">Lending</span>
          </h1>
          <p className="synapse-hero-sub synapse-body synapse-stagger-2">
            AI-first, blockchain-enforced worker lending. Build your on-chain work
            history, get AI-powered credit scoring, and access instant loans with
            transparent, verifiable terms.
          </p>

          {!mounted ? (
            <div className="synapse-hero-actions synapse-stagger-5">
              <ShinyBorderButton disabled>Loading...</ShinyBorderButton>
            </div>
          ) : isConnected ? (
            <div className="synapse-hero-connected synapse-stagger-3">
              <div className="synapse-hero-balance">
                <span className="synapse-label">Your mUSDC Balance</span>
                <span className="synapse-hero-balance-value">
                  ${formatUSDC((usdcBalance as bigint) || 0n)}
                </span>
              </div>
              <div className="synapse-hero-actions synapse-stagger-5">
                <ShinyBorderButton href="/register">Get Started →</ShinyBorderButton>
                <Link href="/loan" className="synapse-hero-link">
                  Manage Loan
                </Link>
              </div>
            </div>
          ) : (
            <div className="synapse-hero-actions synapse-stagger-5">
              <ShinyBorderButton onClick={() => connect({ connector: connectors[0] })}>
                Connect Wallet
              </ShinyBorderButton>
              <Link href="/register" className="synapse-hero-link">
                Create account →
              </Link>
            </div>
          )}
        </div>
      </section>

      <MetricsTicker />

      {/* Feature Grid */}
      <section className="synapse-features">
        <div className="synapse-features-inner">
          {FEATURES.map((f) => (
            <FeatureCard
              key={f.title}
              icon={f.icon}
              title={f.title}
              description={f.description}
              delay={f.delay}
            />
          ))}
        </div>
      </section>

      {/* Code block */}
      <section className="synapse-code-section">
        <div className="synapse-code-inner">
          <CodeBlock />
        </div>
      </section>

      <Footer />
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortenAddress } from '@/lib/format';
import { isCorrectChain } from '@/config/wagmi';

export function Navigation() {
  const pathname = usePathname();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (path: string) => pathname === path;
  const isWrongChain = isConnected && !isCorrectChain(chainId);

  return (
    <nav className="synapse-nav">
      <Link href="/" className="synapse-nav-logo">
        <span className="synapse-nav-logo-dot" />
        <span className="synapse-nav-logo-text">UnEmpower</span>
      </Link>

      <div className="synapse-nav-links">
        <Link
          href="/register"
          className={`synapse-nav-link ${isActive('/register') ? 'active' : ''}`}
        >
          Register
        </Link>
        <Link
          href="/workproofs"
          className={`synapse-nav-link ${isActive('/workproofs') ? 'active' : ''}`}
        >
          Work Proofs
        </Link>
        <Link
          href="/offer"
          className={`synapse-nav-link ${isActive('/offer') ? 'active' : ''}`}
        >
          Get Offer
        </Link>
        <Link
          href="/loan"
          className={`synapse-nav-link ${isActive('/loan') ? 'active' : ''}`}
        >
          Loan
        </Link>
      </div>

      <div className="synapse-nav-cta">
        {!mounted ? (
          <span className="synapse-nav-cta-placeholder">Loading...</span>
        ) : isConnected ? (
          <div className="synapse-nav-wallet">
            {isWrongChain && (
              <span className="synapse-nav-chain-warn">Wrong network</span>
            )}
            <button
              type="button"
              className="synapse-nav-disconnect"
              onClick={() => disconnect()}
            >
              {shortenAddress(address || '')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="synapse-nav-connect"
            onClick={() => {
              if (connectors.length > 0) {
                connect({ connector: connectors[0] }, {
                  onError: (err) => console.error('Connection failed:', err)
                });
              } else {
                console.error('No connectors found. Is a wallet installed?');
                // Fallback or alert could go here
                alert('No wallet connector found. Please install MetaMask or similar.');
              }
            }}
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

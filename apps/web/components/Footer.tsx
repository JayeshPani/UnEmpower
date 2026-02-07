'use client';

import Link from 'next/link';

const FOOTER_LINKS = {
  Product: [
    { label: 'Register', href: '/register' },
    { label: 'Work Proofs', href: '/workproofs' },
    { label: 'Get Offer', href: '/offer' },
    { label: 'Loan', href: '/loan' },
  ],
  Resources: [
    { label: 'Docs', href: '#' },
    { label: 'API', href: '#' },
    { label: 'GitHub', href: '#' },
  ],
  Legal: [
    { label: 'Privacy', href: '#' },
    { label: 'Terms', href: '#' },
  ],
};

export function Footer() {
  return (
    <footer className="synapse-footer">
      <div className="synapse-footer-grid">
        <div className="synapse-footer-brand">
          <span className="synapse-footer-logo">UnEmpower</span>
          <p className="synapse-body synapse-footer-tagline">
            AI-first worker lending. On-chain credit.
          </p>
        </div>
        {Object.entries(FOOTER_LINKS).map(([category, links]) => (
          <div key={category} className="synapse-footer-col">
            <h4 className="synapse-footer-heading">{category}</h4>
            <ul className="synapse-footer-links">
              {links.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="synapse-footer-link">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="synapse-footer-bar">
        <span className="synapse-footer-copy">
          © {new Date().getFullYear()} UnEmpower. All rights reserved.
        </span>
        <span className="synapse-footer-status">
          <span className="synapse-footer-status-dot" />
          All Systems Operational
        </span>
      </div>
    </footer>
  );
}

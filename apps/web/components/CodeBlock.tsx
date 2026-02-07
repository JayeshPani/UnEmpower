'use client';

import { useState } from 'react';

const SAMPLE_CODE = `// Connect and register as a worker
const { address } = useAccount();
await registerWorker(address);

// Submit work proof (EIP-712 signed)
const proof = await createWorkProof({
  worker: address,
  employer: employerAddress,
  amount: parseUnits("1500", 6),
});

// Get AI-generated credit attestation
const attestation = await getAttestation(address);

// Draw loan against attestation
await loanVault.draw(attestation, amount);`;

export function CodeBlock() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(SAMPLE_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="synapse-code-block">
      <div className="synapse-code-toolbar">
        <div className="synapse-code-dots">
          <span className="synapse-code-dot red" />
          <span className="synapse-code-dot yellow" />
          <span className="synapse-code-dot green" />
        </div>
        <span className="synapse-code-filename">integrate.ts</span>
        <button
          type="button"
          className="synapse-code-copy"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="synapse-code-pre">
        <code className="synapse-code-content">{SAMPLE_CODE}</code>
      </pre>
    </div>
  );
}

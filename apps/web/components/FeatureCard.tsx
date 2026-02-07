'use client';

import { useRef, useState, useEffect } from 'react';

type Props = {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
};

export function FeatureCard({ icon, title, description, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`synapse-feature-card ${visible ? 'synapse-feature-card-visible' : ''}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      <div className="synapse-feature-card-icon">{icon}</div>
      <h3 className="synapse-heading synapse-feature-card-title">{title}</h3>
      <p className="synapse-body synapse-feature-card-desc">{description}</p>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/config/contracts';

interface SuggestionAction {
    type: 'NAVIGATE' | 'HIGHLIGHT' | 'SCROLL_TO';
    to?: string;
    targetId?: string;
}

interface Suggestion {
    id: string;
    title: string;
    why: string;
    impact: 'HIGH' | 'MED' | 'LOW';
    action: SuggestionAction;
}

const IMPACT_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
    HIGH: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.2)', color: '#ef4444', label: 'High Priority' },
    MED: { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.2)', color: '#f59e0b', label: 'Medium' },
    LOW: { bg: 'rgba(99,102,241,.08)', border: 'rgba(99,102,241,.2)', color: '#818cf8', label: 'Tip' },
};

export function SuggestionsPanel({ wallet }: { wallet?: string }) {
    const router = useRouter();
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    const fetchSuggestions = useCallback(async () => {
        if (!wallet) { setLoading(false); return; }
        try {
            const res = await fetch(`${API_URL}/suggestions/worker?wallet=${wallet}`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.suggestions || []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [wallet]);

    useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

    const executeAction = (action: SuggestionAction) => {
        if (action.type === 'NAVIGATE' && action.to) {
            router.push(action.to);
        } else if (action.type === 'HIGHLIGHT' && action.targetId) {
            const el = document.getElementById(action.targetId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.boxShadow = '0 0 0 3px rgba(99,102,241,.5), 0 0 20px rgba(99,102,241,.3)';
                el.style.transition = 'box-shadow .3s';
                setTimeout(() => { el.style.boxShadow = ''; }, 3000);
            }
        } else if (action.type === 'SCROLL_TO' && action.targetId) {
            const el = document.getElementById(action.targetId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    if (loading || suggestions.length === 0) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,.04) 0%, rgba(16,185,129,.03) 100%)',
            border: '1px solid rgba(99,102,241,.1)',
            borderRadius: 14,
            padding: collapsed ? '14px 20px' : '20px 24px',
            marginBottom: 24,
        }}>
            <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setCollapsed(!collapsed)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>&#x1F4A1;</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#818cf8' }}>
                        Next Best Actions
                    </span>
                    <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(99,102,241,.12)', color: '#818cf8',
                    }}>
                        {suggestions.length}
                    </span>
                </div>
                <span style={{ color: 'rgba(163,163,163,.4)', fontSize: 14 }}>
                    {collapsed ? '+' : '\u2212'}
                </span>
            </div>

            {!collapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    {suggestions.map(s => {
                        const style = IMPACT_STYLES[s.impact] || IMPACT_STYLES.LOW;
                        return (
                            <div
                                key={s.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: '14px 18px', borderRadius: 10,
                                    background: style.bg,
                                    border: `1px solid ${style.border}`,
                                    cursor: 'pointer',
                                    transition: 'transform .15s, box-shadow .15s',
                                }}
                                onClick={() => executeAction(s.action)}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.2)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.transform = '';
                                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                            letterSpacing: 1, padding: '2px 6px', borderRadius: 4,
                                            background: style.bg, color: style.color,
                                            border: `1px solid ${style.border}`,
                                        }}>
                                            {style.label}
                                        </span>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.9)' }}>
                                            {s.title}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(163,163,163,.7)', lineHeight: 1.4 }}>
                                        {s.why}
                                    </p>
                                </div>
                                <span style={{ fontSize: 18, color: style.color, flexShrink: 0 }}>&#x2192;</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

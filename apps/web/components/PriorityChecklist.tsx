'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/config/contracts';

interface ChecklistItem {
    id: string;
    label: string;
    done: boolean;
    detail: string;
    optional?: boolean;
}

interface Props {
    type: 'worker' | 'manager';
    wallet?: string;
    managerToken?: string;
}

export function PriorityChecklist({ type, wallet, managerToken }: Props) {
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchChecklist = useCallback(async () => {
        try {
            let res: Response;
            if (type === 'worker' && wallet) {
                res = await fetch(`${API_URL}/suggestions/worker/checklist?wallet=${wallet}`);
            } else if (type === 'manager' && managerToken) {
                res = await fetch(`${API_URL}/suggestions/manager/checklist`, {
                    headers: { Authorization: `Bearer ${managerToken}` },
                });
            } else {
                setLoading(false);
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setItems(data.checklist || []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [type, wallet, managerToken]);

    useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

    if (loading || items.length === 0) return null;

    const doneCount = items.filter(i => i.done).length;
    const total = items.length;
    const pct = Math.round((doneCount / total) * 100);

    return (
        <div style={{
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.06)',
            borderRadius: 14,
            padding: '20px 24px',
            marginBottom: 24,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>&#x1F3AF;</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {type === 'worker' ? 'Your Journey' : 'Setup Progress'}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'rgba(163,163,163,.6)' }}>
                        {doneCount}/{total}
                    </span>
                    <div style={{
                        width: 60, height: 6, borderRadius: 3,
                        background: 'rgba(255,255,255,.06)', overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${pct}%`, height: '100%', borderRadius: 3,
                            background: pct === 100 ? '#10b981' : '#818cf8',
                            transition: 'width .5s ease',
                        }} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => (
                    <div
                        key={item.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', borderRadius: 8,
                            background: item.done ? 'rgba(16,185,129,.04)' : 'rgba(255,255,255,.01)',
                            border: `1px solid ${item.done ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.04)'}`,
                        }}
                    >
                        <span style={{
                            width: 22, height: 22, borderRadius: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, flexShrink: 0,
                            background: item.done ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.04)',
                            color: item.done ? '#10b981' : 'rgba(163,163,163,.3)',
                            border: `1px solid ${item.done ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.06)'}`,
                        }}>
                            {item.done ? '\u2713' : '\u25CB'}
                        </span>
                        <div style={{ flex: 1 }}>
                            <span style={{
                                fontSize: 13, fontWeight: 500,
                                color: item.done ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.9)',
                                textDecoration: item.done ? 'line-through' : 'none',
                                opacity: item.done ? 0.7 : 1,
                            }}>
                                {item.label}
                            </span>
                            {item.optional && !item.done && (
                                <span style={{ fontSize: 10, color: 'rgba(163,163,163,.4)', marginLeft: 6 }}>optional</span>
                            )}
                        </div>
                        <span style={{
                            fontSize: 11, color: item.done ? '#10b981' : 'rgba(163,163,163,.5)',
                            whiteSpace: 'nowrap',
                        }}>
                            {item.detail}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

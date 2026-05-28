// components/ScriptGenerator.jsx — AI Call Script Generator UI
// Fixed: goals/presets fetched from API (not hardcoded), customInstructions field added,
//        structured script display instead of raw JSON, all presets shown

import React, { useState, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || '/api/scripts';

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', desc: 'Formal, polished, business-appropriate' },
  { value: 'friendly',     label: 'Friendly',     desc: 'Warm, conversational, uses first names' },
  { value: 'urgent',       label: 'Urgent',       desc: 'Direct, action-oriented, time-sensitive' },
  { value: 'empathetic',   label: 'Empathetic',   desc: 'Patient, validating, supportive' }
];

const CATEGORY_COLORS = {
  scheduling: '#3B82F6',
  sales:      '#D97706',
  support:    '#10B981',
  research:   '#8B5CF6',
  security:   '#EF4444'
};

export default function ScriptGenerator({ businessId = null }) {
  const [goals, setGoals]               = useState([]);
  const [presets, setPresets]           = useState([]);
  const [selectedGoals, setSelectedGoals]   = useState([]);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [tone, setTone]                 = useState('professional');
  const [maxDuration, setMaxDuration]   = useState(5);
  const [customInstructions, setCustomInstructions] = useState('');
  const [includeObjections, setIncludeObjections]   = useState(true);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState(null);
  const [activeTab, setActiveTab]       = useState('flow'); // flow | json | metadata

  // Fetch goals and presets from the API on mount
  useEffect(() => {
    fetch(`${API_BASE}/goals`)
      .then(r => r.json())
      .then(data => {
        setGoals(data.goals || []);
        setPresets(data.presets || []);
      })
      .catch(() => setError('Could not load goals from API. Is the server running?'));
  }, []);

  const toggleGoal = (goalId) => {
    setSelectedGoals(prev =>
      prev.includes(goalId) ? prev.filter(g => g !== goalId) : [...prev, goalId]
    );
    setSelectedPreset(null); // clear preset when manually selecting
  };

  const applyPreset = (preset) => {
    setSelectedGoals(preset.goals);
    setSelectedPreset(preset.id);
    if (preset.recommendedTone) setTone(preset.recommendedTone);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: selectedGoals,
          presetId: selectedPreset,
          businessId,
          tone,
          includeObjectionHandling: includeObjections,
          maxDurationMinutes: maxDuration,
          customInstructions
        })
      });

      const data = await res.json();
      if (data.success) {
        setResult(data);
        setActiveTab('flow');
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err) {
      setError('Network error — is the server running?');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };

  // Group goals by category for display
  const goalsByCategory = goals.reduce((acc, goal) => {
    if (!acc[goal.category]) acc[goal.category] = [];
    acc[goal.category].push(goal);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1A1714', margin: 0 }}>AI Call Script Generator</h1>
        <p style={{ color: '#6A5E50', fontSize: 13, marginTop: 4 }}>
          Select goals, pick a tone, and let Claude write a ready-to-use voice receptionist script.
        </p>
      </div>

      {/* ── Presets ── */}
      <Section title="Quick Start — Presets">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {presets.map(preset => (
            <button key={preset.id} onClick={() => applyPreset(preset)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1.5px solid',
                borderColor: selectedPreset === preset.id ? '#D97706' : '#E5E0D8',
                background: selectedPreset === preset.id ? 'rgba(217,119,6,.08)' : '#fff',
                color: selectedPreset === preset.id ? '#92400E' : '#4A4038',
                fontWeight: selectedPreset === preset.id ? 700 : 400,
                cursor: 'pointer', fontSize: 13
              }}>
              {preset.name}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({preset.goals.length} goals)</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Goal selection ── */}
      <Section title="Goals — Select One or More">
        {Object.entries(goalsByCategory).map(([category, catGoals]) => (
          <div key={category} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: CATEGORY_COLORS[category] || '#8A7866', marginBottom: 6 }}>
              {category}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {catGoals.map(goal => {
                const selected = selectedGoals.includes(goal.id);
                return (
                  <label key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: selected ? 'rgba(217,119,6,.06)' : '#fff', border: '1px solid', borderColor: selected ? '#D97706' : '#E5E0D8', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', minWidth: 200 }}>
                    <input type="checkbox" checked={selected} onChange={() => toggleGoal(goal.id)} style={{ marginTop: 2, accentColor: '#D97706' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: '#1A1714' }}>{goal.name}</div>
                      <div style={{ fontSize: 11, color: '#8A7866', marginTop: 2 }}>{goal.description}</div>
                      <div style={{ fontSize: 10, color: '#B0A090', marginTop: 2 }}>{goal.estimatedDuration}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {selectedGoals.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#D97706', fontWeight: 600 }}>
            {selectedGoals.length} goal{selectedGoals.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </Section>

      {/* ── Settings ── */}
      <Section title="Settings">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Tone</label>
            <select value={tone} onChange={e => setTone(e.target.value)} style={selectStyle}>
              {TONE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Max Duration: {maxDuration} min</label>
            <input type="range" min={2} max={15} value={maxDuration}
              onChange={e => setMaxDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#D97706' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#B0A090' }}>
              <span>2 min</span><span>15 min</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="objections" checked={includeObjections}
            onChange={e => setIncludeObjections(e.target.checked)} style={{ accentColor: '#D97706' }} />
          <label htmlFor="objections" style={{ fontSize: 13, color: '#4A4038', cursor: 'pointer' }}>
            Include objection handling (recommended)
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Custom Instructions (optional)</label>
          <textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            placeholder="E.g. This is for a dental practice. Emphasize that we accept most major insurance plans. Avoid discussing pricing on first contact."
            rows={3}
            style={{ ...selectStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
      </Section>

      {/* ── Generate button ── */}
      <button
        onClick={handleGenerate}
        disabled={generating || selectedGoals.length === 0}
        style={{
          width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
          background: selectedGoals.length === 0 ? '#E5E0D8' : '#D97706',
          color: selectedGoals.length === 0 ? '#B0A090' : '#fff',
          fontWeight: 700, fontSize: 15, cursor: selectedGoals.length === 0 ? 'not-allowed' : 'pointer',
          marginBottom: 24, transition: 'all .15s'
        }}>
        {generating
          ? '⏳ Generating script...'
          : selectedGoals.length === 0
            ? 'Select at least one goal to generate'
            : `✨ Generate Script  (${selectedGoals.length} goal${selectedGoals.length !== 1 ? 's' : ''})`}
      </button>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 10, padding: '12px 15px', color: '#991B1B', fontSize: 13, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Script output ── */}
      {result && (
        <div style={{ background: '#fff', border: '1px solid #E5E0D8', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ background: '#FAF8F4', padding: '14px 18px', borderBottom: '1px solid #E5E0D8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#1A1714' }}>Generated Script</div>
              <div style={{ fontSize: 12, color: '#8A7866', marginTop: 2 }}>
                {result.metadata?.estimatedDuration} · {result.metadata?.goals?.length} goals · {tone}
              </div>
            </div>
            <button onClick={() => copyToClipboard(JSON.stringify(result.script, null, 2))}
              style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #E5E0D8', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4A4038' }}>
              Copy JSON
            </button>
          </div>

          {/* Tab nav */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E5E0D8' }}>
            {['flow', 'json', 'metadata'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab ? 700 : 400, color: activeTab === tab ? '#D97706' : '#6A5E50', borderBottom: `2px solid ${activeTab === tab ? '#D97706' : 'transparent'}` }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ padding: 20 }}>
            {activeTab === 'flow' && <ScriptFlowView script={result.script} onCopy={copyToClipboard} />}
            {activeTab === 'json' && (
              <pre style={{ background: '#1A1714', color: '#E8E4DE', borderRadius: 10, padding: 16, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(result.script, null, 2)}
              </pre>
            )}
            {activeTab === 'metadata' && (
              <div style={{ fontSize: 13, color: '#4A4038', lineHeight: 1.9 }}>
                <div><strong>Goals:</strong> {result.metadata?.goals?.join(', ')}</div>
                <div><strong>Order:</strong> {result.metadata?.orderedGoals?.join(' → ')}</div>
                <div><strong>Est. Duration:</strong> {result.metadata?.estimatedDuration}</div>
                <div><strong>Tone:</strong> {result.metadata?.tone}</div>
                {result.metadata?.warnings?.length > 0 && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(217,119,6,.08)', borderRadius: 8, color: '#92400E' }}>
                    ⚠️ {result.metadata.warnings.join(' ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Script flow renderer ────────────────────────────────────────────────────
function ScriptFlowView({ script, onCopy }) {
  if (!script) return null;
  return (
    <div>
      {script.greeting && (
        <ScriptBlock label="Greeting" color="#D97706" onCopy={() => onCopy(script.greeting)}>
          <p style={{ margin: 0, fontSize: 14, color: '#1A1714', fontStyle: 'italic' }}>"{script.greeting}"</p>
        </ScriptBlock>
      )}

      {script.flow?.map((stage, i) => (
        <ScriptBlock key={i} label={`Stage ${i + 1}: ${stage.stage}`} color="#3B82F6"
          onCopy={() => onCopy(stage.aiPrompts?.join('\n') || '')}>
          <div style={{ fontSize: 12, color: '#6A5E50', marginBottom: 10 }}>{stage.purpose}</div>
          {stage.aiPrompts?.map((p, j) => (
            <div key={j} style={{ background: '#F0F7FF', borderRadius: 7, padding: '8px 12px', fontSize: 13, marginBottom: 6, color: '#1A1714', fontStyle: 'italic' }}>
              "{p}"
            </div>
          ))}
          {stage.callerResponses && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B0A090', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Caller Responses</div>
              {Object.entries(stage.callerResponses).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', gap: 10, marginBottom: 5, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: key === 'positive' ? 'rgba(16,185,129,.1)' : key === 'negative' ? 'rgba(220,38,38,.1)' : 'rgba(107,114,128,.1)', color: key === 'positive' ? '#059669' : key === 'negative' ? '#DC2626' : '#6B7280', whiteSpace: 'nowrap', marginTop: 2 }}>{key}</span>
                  <span style={{ fontSize: 12, color: '#4A4038', fontStyle: 'italic' }}>"{val}"</span>
                </div>
              ))}
            </div>
          )}
        </ScriptBlock>
      ))}

      {script.closing && (
        <ScriptBlock label="Closing" color="#10B981" onCopy={() => onCopy(typeof script.closing === 'string' ? script.closing : JSON.stringify(script.closing))}>
          {typeof script.closing === 'string'
            ? <p style={{ margin: 0, fontSize: 14, color: '#1A1714', fontStyle: 'italic' }}>"{script.closing}"</p>
            : Object.entries(script.closing).map(([outcome, line]) => (
              <div key={outcome} style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8A7866', textTransform: 'uppercase' }}>{outcome}: </span>
                <span style={{ fontSize: 13, color: '#1A1714', fontStyle: 'italic' }}>"{line}"</span>
              </div>
            ))
          }
        </ScriptBlock>
      )}

      {script.notes?.length > 0 && (
        <ScriptBlock label="Agent Notes" color="#8B5CF6">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {script.notes.map((note, i) => (
              <li key={i} style={{ fontSize: 13, color: '#4A4038', marginBottom: 4 }}>{note}</li>
            ))}
          </ul>
        </ScriptBlock>
      )}
    </div>
  );
}

function ScriptBlock({ label, color, onCopy, children }) {
  return (
    <div style={{ border: '1px solid #E5E0D8', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ background: '#FAF8F4', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E0D8' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
        {onCopy && (
          <button onClick={onCopy} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid #E5E0D8', background: '#fff', cursor: 'pointer', color: '#6A5E50' }}>Copy</button>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8A7866', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#8A7866', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 };
const selectStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E0D8', fontSize: 13, color: '#1A1714', background: '#fff', fontFamily: 'inherit' };

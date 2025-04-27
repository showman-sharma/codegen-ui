import AceEditor from 'react-ace';

import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/theme-twilight';

import React, { useState } from 'react';
import './index.css';

const API_BASE = process.env.REACT_APP_API_URL;

export default function CodeGenerationUI() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState(null); // 'scot' | 'refine'
  const [scot, setScot] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [code, setCode] = useState('');
  const [numSamples, setNumSamples] = useState(1);

  const [loadingScot, setLoadingScot] = useState(false);
  const [loadingRefine, setLoadingRefine] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);

  // Handlers
  async function generateCode() {
    setLoadingCode(true);
    try {
      const res = await fetch('${API_BASE}/generate-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, numSamples }),
      });
      const { code: newCode } = await res.json();
      setCode(newCode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCode(false);
    }
  }

  async function generateScot() {
    setMode('scot'); setLoadingScot(true);
    try {
      const res = await fetch('${API_BASE}/generate-scot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const { scot: newScot } = await res.json();
      setScot(newScot);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingScot(false);
    }
  }

  async function implementScot() {
    setLoadingCode(true);
    try {
      const res = await fetch('${API_BASE}/generate-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, scot }),
      });
      const { code: newCode } = await res.json();
      setCode(newCode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCode(false);
    }
  }

  async function suggestRefinement() {
    setMode('refine'); setLoadingRefine(true);
    try {
      const res = await fetch('${API_BASE}/suggest-refine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, code }),
      });
      const { suggestion: newSuggestion } = await res.json();
      setSuggestion(newSuggestion);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRefine(false);
    }
  }

  async function refineFromSuggestion() {
    setLoadingCode(true);
    try {
      const res = await fetch('${API_BASE}/refine-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, suggestion }),
      });
      const { refinedCode } = await res.json();
      setCode(refinedCode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCode(false);
    }
  }

  async function autoEnhance() {
    setLoadingCode(true);
    try {
      const res = await fetch('${API_BASE}/auto-enhance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, code }),
      });
      const { enhancedCode } = await res.json();
      setCode(enhancedCode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCode(false);
    }
  }

  return (
    <div className="app">
      {/* Editor Pane */}
      <div className="editor-pane">
        <div className="editor-area" style={{ position: 'relative' }}>
          {/* Syntax-highlighted, editable Python editor */}
          <AceEditor
            mode="python"
            theme="twilight"
            value={code}
            onChange={setCode}
            name="python-editor"
            width="100%"
            height="100%"
            readOnly={loadingCode}
            setOptions={{ useWorker: false }}
            editorProps={{ $blockScrolling: true }}
            fontSize={14}
          />

          {loadingCode && <div className="overlay"><div className="spinner"/></div>}
          <button
            className="btn auto-btn"
            onClick={autoEnhance}
            disabled={loadingCode}
            style={{ position: 'absolute', bottom: 16, right: 16 }}
          >Auto-Enhance</button>
        </div>

        {/* Prompt + Samples + Generate */}
        <div className="prompt-area" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <textarea
            className="prompt-text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Enter your main prompt here..."
            disabled={loadingCode}
            style={{ flex: 1, height: 64 }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <label htmlFor="samples-input" style={{ whiteSpace: 'nowrap' }}>Samples:  </label>
              <input
                id="samples-input"
                type="number"
                min={1}
                value={numSamples}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  setNumSamples(isNaN(v) || v < 1 ? 1 : v);
                }}
                disabled={loadingCode}
                style={{ width: '4ch', padding: '2px', textAlign: 'center' }}
              />
            </div>
            <button
              className="btn"
              onClick={generateCode}
              disabled={loadingCode}
              style={{ width: '100%' }}
            >Generate Code</button>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div className="side-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-content" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {mode === 'scot' && (
            <>
              <textarea
                className="panel-text"
                value={scot}
                onChange={e => setScot(e.target.value)}
                disabled={loadingScot}
                style={{ flex: 1, width: '100%' }}
              />
              {loadingScot && <div className="overlay"><div className="spinner"/></div>}
              {scot && !loadingScot && (
                <button className="btn action-panel-btn" onClick={implementScot} disabled={loadingCode}>
                  Implement SCoT
                </button>
              )}
            </>
          )}
          {mode === 'refine' && (
            <>
              <textarea
                className="panel-text"
                value={suggestion}
                onChange={e => setSuggestion(e.target.value)}
                disabled={loadingRefine}
                style={{ flex: 1, width: '100%' }}
              />
              {loadingRefine && <div className="overlay"><div className="spinner"/></div>}
              {suggestion && !loadingRefine && (
                <button className="btn action-panel-btn" onClick={refineFromSuggestion} disabled={loadingCode}>
                  Refine Code
                </button>
              )}
            </>
          )}
          {!mode && (
            <div className="placeholder" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Choose an action below
            </div>
          )}
        </div>
        <div className="action-row" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button className="btn flex-btn" onClick={generateScot} disabled={loadingScot || loadingCode} style={{ flex: 1 }}>
            Generate SCoT
          </button>
          <button className="btn flex-btn" onClick={suggestRefinement} disabled={loadingRefine || loadingCode} style={{ flex: 1 }}>
            Suggest Refinement
          </button>
        </div>
      </div>
    </div>
  );
}

import AceEditor from 'react-ace';

import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/theme-twilight';
import 'ace-builds/src-noconflict/theme-textmate';

// ... imports ...
import React, { useState } from 'react';
import './index.css';
import logoDark from './assets/logo-dark.png';
import logoLight from './assets/logo-light.png';
import ReactMarkdown from 'react-markdown';

const API_BASE = (process.env.REACT_APP_API_URL || '') + '/api';

export default function CodeGenerationUI() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState(null);
  const [scot, setScot] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [code, setCode] = useState('');
  const [numSamples, setNumSamples] = useState(1);
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [darkMode, setDarkMode] = useState(true);
  const [copied, setCopied] = useState(false);

  const [loadingScot, setLoadingScot] = useState(false);
  const [loadingRefine, setLoadingRefine] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);

  const [isEditable, setIsEditable] = useState(false);
  const [editableText, setEditableText] = useState('');

  const toggleTheme = () => setDarkMode(prev => !prev);

  const fetchOptions = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
  });

  async function generateCode() {
    setLoadingCode(true);
    try {
      const res = await fetch(`${API_BASE}/generate-code`, fetchOptions({ prompt, numSamples, code }));
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
      const res = await fetch(`${API_BASE}/generate-scot`, fetchOptions({ prompt }));
      const { scot: newScot } = await res.json();
      setScot(newScot);
      setEditableText(newScot);
      setIsEditable(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingScot(false);
    }
  }

  async function implementScot() {
    setLoadingCode(true);
    try {
      const res = await fetch(`${API_BASE}/generate-code`, fetchOptions({ prompt, scot }));
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
      const res = await fetch(`${API_BASE}/suggest-refine`, fetchOptions({ prompt, code }));
      const { suggestion: newSuggestion } = await res.json();
      setSuggestion(newSuggestion);
      setEditableText(newSuggestion);
      setIsEditable(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRefine(false);
    }
  }

  async function refineFromSuggestion() {
    setLoadingCode(true);
    try {
      const res = await fetch(`${API_BASE}/refine-code`, fetchOptions({ code, suggestion }));
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
      const res = await fetch(`${API_BASE}/auto-enhance`, fetchOptions({ prompt, code }));
      const { enhancedCode } = await res.json();
      setCode(enhancedCode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCode(false);
    }
  }

  async function explainCode() {
    setMode('explain'); setLoadingRefine(true);
    try {
      const res = await fetch(`${API_BASE}/explain-code`, fetchOptions({ code }));
      const { explanation } = await res.json();
      setSuggestion(explanation);
      setEditableText(explanation);
      setIsEditable(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRefine(false);
    }
  }

  async function addComments() {
    setLoadingCode(true);
    try {
      const res = await fetch(`${API_BASE}/comment-code`, fetchOptions({ code }));
      const { commentedCode } = await res.json();
      setCode(commentedCode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCode(false);
    }
  }

  const currentText = mode === 'scot' ? scot : suggestion;
  const setCurrentText = (text) => {
    if (mode === 'scot') setScot(text);
    else setSuggestion(text);
  };

  return (
    <div className={darkMode ? 'app dark' : 'app light'}>
      <header className="header-bar">
        <div className="left-header">
          <img src={darkMode ? logoDark : logoLight} alt="Logo" className="logo" />
          <h1 className="title">CODEGEN-UI</h1>
        </div>
        <div className="right-header">
          <select value={model} onChange={e => setModel(e.target.value)} className="model-select">
            <option value="gpt-3.5-turbo">GPT-3.5 turbo</option>
            <option value="gpt-4.1-nano">GPT-4.1 nano</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
          </select>
          <button className="theme-toggle" onClick={toggleTheme}>
            {darkMode ? '🌙' : '🔆'}
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className="editor-pane">
          <div className="editor-area">
            <div className="copy-button-container">
              <button
                className={`copy-btn ${copied ? 'copied' : ''}`}
                onClick={() => {
                  navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <AceEditor
              mode="python"
              theme={darkMode ? 'twilight' : 'textmate'}
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
            {loadingCode && <div className="overlay"><div className="spinner" /></div>}
            <button className="btn auto-btn" onClick={autoEnhance} disabled={loadingCode}>Auto-Enhance</button>
          </div>

          <div className="prompt-area">
            <textarea
              className="prompt-text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter your main prompt here..."
              disabled={loadingCode}
            />
            <div className="sample-controls">
              <label htmlFor="samples-input">Samples:</label>
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
              />
              <button className="btn" onClick={generateCode} disabled={loadingCode}>Generate Code</button>
            </div>
          </div>
        </div>

        <div className="side-panel">
          <div className="panel-content">
            {(mode === 'scot' || mode === 'refine' || mode === 'explain') ? (
              <>
                <div className="panel-text-wrapper">
                  {isEditable ? (
                    <textarea
                      className="editable-textarea"
                      value={editableText}
                      onChange={(e) => setEditableText(e.target.value)}
                    />
                  ) : (
                    <div className="markdown-view">
                      <ReactMarkdown>{currentText}</ReactMarkdown>
                    </div>
                  )}
                  <button
                    className="floating-edit-btn"
                    onClick={() => {
                      if (isEditable) {
                        setCurrentText(editableText);
                      }
                      setIsEditable(!isEditable);
                    }}
                    title={isEditable ? 'Save' : 'Edit'}
                  >
                    {isEditable ? '✅' : '✎'}
                  </button>
                </div>

                {(loadingScot || loadingRefine) && (
                  <div className="overlay"><div className="spinner" /></div>
                )}

                {(mode === 'scot' && scot && !loadingScot) && (
                  <button className="btn action-panel-btn" onClick={implementScot} disabled={loadingCode}>
                    Implement SCoT
                  </button>
                )}
                {(mode === 'refine' && suggestion && !loadingRefine) && (
                  <button className="btn action-panel-btn" onClick={refineFromSuggestion} disabled={loadingCode}>
                    Refine Code
                  </button>
                )}
                {(mode === 'explain' && suggestion && !loadingRefine) && (
                  <button className="btn action-panel-btn" onClick={addComments} disabled={loadingCode}>
                    Add Comments
                  </button>
                )}
              </>
            ) : (
              <div className="placeholder">Choose an action below</div>
            )}
          </div>


          <div className="action-row">
            <button className="btn flex-btn" onClick={generateScot} disabled={loadingScot || loadingCode}>Generate SCoT</button>
            <button className="btn flex-btn" onClick={suggestRefinement} disabled={loadingRefine || loadingCode}>Suggest Refinement</button>
            <button className="btn flex-btn" onClick={explainCode} disabled={loadingRefine || loadingCode}>Explain Code</button>
          </div>
        </div>
      </div>
    </div>
  );
}

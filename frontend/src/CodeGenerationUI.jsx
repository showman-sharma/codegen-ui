import React, { useMemo, useState } from 'react';
import AceEditor from 'react-ace';
import ReactMarkdown from 'react-markdown';

import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/theme-twilight';
import 'ace-builds/src-noconflict/theme-textmate';

import './index.css';
import logoDark from './assets/logo-dark.png';
import logoLight from './assets/logo-light.png';

const API_BASE = (process.env.REACT_APP_API_URL || '') + '/api';

const MODELS = {
  'qwen/qwen3-coder-30b-a3b-instruct': {
    name: 'Qwen3 Coder 30B',
    badge: 'Best value',
    tone: 'value',
    meta: 'Fast · coding-first',
  },
  'deepseek/deepseek-v3.2': {
    name: 'DeepSeek V3.2',
    badge: 'Strong',
    tone: 'strong',
    meta: 'Reasoning · robust',
  },
  'openai/gpt-oss-20b': {
    name: 'GPT-OSS 20B',
    badge: 'Cheapest',
    tone: 'cheap',
    meta: 'Ultra-low cost',
  },
  'openai/gpt-oss-120b': {
    name: 'GPT-OSS 120B',
    badge: 'Value',
    tone: 'value',
    meta: 'Reasoning · low cost',
  },
  'qwen/qwen3-coder-next': {
    name: 'Qwen3 Coder Next',
    badge: 'Long context',
    tone: 'strong',
    meta: '262K context',
  },
  'qwen/qwen3-coder-flash': {
    name: 'Qwen3 Coder Flash',
    badge: '1M context',
    tone: 'value',
    meta: 'Huge context',
  },
  'z-ai/glm-5.3': {
    name: 'GLM 5.3',
    badge: 'Premium',
    tone: 'premium',
    meta: 'Deep coding',
  },
  'gpt-4.1-nano': {
    name: 'GPT-4.1 nano',
    badge: 'OpenAI',
    tone: 'neutral',
    meta: 'Direct OpenAI',
  },
  'gpt-4o-mini': {
    name: 'GPT-4o mini',
    badge: 'OpenAI',
    tone: 'neutral',
    meta: 'Direct OpenAI',
  },
};

const STARTERS = [
  'Build an LRU cache with O(1) get and put',
  'Parse a nested arithmetic expression safely',
  'Find the longest subarray whose sum equals k',
];

function Spinner() {
  return <span className="inline-spinner" aria-label="loading" />;
}

export default function CodeGenerationUI() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('plan');
  const [scot, setScot] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [code, setCode] = useState('');
  const [numSamples, setNumSamples] = useState(1);
  const [model, setModel] = useState('qwen/qwen3-coder-30b-a3b-instruct');
  const [darkMode, setDarkMode] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedTest, setCopiedTest] = useState(false);
  const [loadingScot, setLoadingScot] = useState(false);
  const [loadingRefine, setLoadingRefine] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [isEditable, setIsEditable] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [functionList, setFunctionList] = useState([]);
  const [selectedFunction, setSelectedFunction] = useState('');
  const [lastLatency, setLastLatency] = useState(null);
  const [lastAction, setLastAction] = useState('Ready');
  const [error, setError] = useState('');

  const modelInfo = MODELS[model] || { name: model, badge: 'Model', tone: 'neutral', meta: '' };
  const busy = loadingCode || loadingScot || loadingRefine;

  const currentText = useMemo(() => {
    if (mode === 'plan') return scot;
    return suggestion;
  }, [mode, scot, suggestion]);

  const setCurrentText = (text) => {
    if (mode === 'plan') setScot(text);
    else setSuggestion(text);
  };

  const fetchOptions = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
  });

  async function callApi(url, body, action, setter, loadingSetter) {
    loadingSetter(true);
    setError('');
    setLastAction(action);
    const started = performance.now();

    try {
      const res = await fetch(`${API_BASE}${url}`, fetchOptions(body));
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || `Request failed with status ${res.status}`);
      }

      setter(payload);
      setLastLatency(Math.round(performance.now() - started));
      setLastAction(action + ' complete');
      return payload;
    } catch (e) {
      console.error(e);
      setError(e.message || 'Something went wrong');
      setLastAction('Request failed');
      return null;
    } finally {
      loadingSetter(false);
    }
  }

  async function generateCode() {
    await callApi(
      '/generate-code',
      { prompt, numSamples, code },
      'Generating code',
      ({ code: newCode }) => setCode(newCode),
      setLoadingCode
    );
  }

  async function generateScot() {
    setMode('plan');
    await callApi(
      '/generate-scot',
      { prompt },
      'Planning solution',
      ({ scot: newScot }) => {
        setScot(newScot);
        setEditableText(newScot);
        setIsEditable(false);
      },
      setLoadingScot
    );
  }

  async function implementScot() {
    await callApi(
      '/generate-code',
      { prompt, scot },
      'Implementing plan',
      ({ code: newCode }) => setCode(newCode),
      setLoadingCode
    );
  }

  async function suggestRefinement() {
    setMode('review');
    await callApi(
      '/suggest-refine',
      { prompt, code },
      'Reviewing code',
      ({ suggestion: newSuggestion }) => {
        setSuggestion(newSuggestion);
        setEditableText(newSuggestion);
        setIsEditable(false);
      },
      setLoadingRefine
    );
  }

  async function refineFromSuggestion() {
    await callApi(
      '/refine-code',
      { code, suggestion },
      'Applying review',
      ({ refinedCode }) => setCode(refinedCode),
      setLoadingCode
    );
  }

  async function autoEnhance() {
    await callApi(
      '/auto-enhance',
      { prompt, code },
      'Improving code',
      ({ enhancedCode }) => setCode(enhancedCode),
      setLoadingCode
    );
  }

  async function explainCode() {
    setMode('explain');
    await callApi(
      '/explain-code',
      { code },
      'Explaining code',
      ({ explanation }) => {
        setSuggestion(explanation);
        setEditableText(explanation);
        setIsEditable(false);
      },
      setLoadingRefine
    );
  }

  async function addComments() {
    await callApi(
      '/comment-code',
      { code },
      'Adding comments',
      ({ commentedCode }) => setCode(commentedCode),
      setLoadingCode
    );
  }

  function prepareTestCases() {
    const matches = code.match(/def\s+(\w+)\s*\(/g) || [];
    const fnNames = matches.map((line) => line.match(/def\s+(\w+)\s*\(/)[1]);
    setFunctionList(fnNames);
    setSelectedFunction(fnNames.at(-1) || '');
    setMode('test');
    setSuggestion('');
    setEditableText('');
  }

  async function generateTestCases() {
    setMode('test');
    await callApi(
      '/generate-tests',
      { prompt, code, mainFn: selectedFunction },
      'Generating tests',
      ({ testCases }) => {
        setSuggestion(testCases);
        setEditableText(testCases);
        setIsEditable(false);
      },
      setLoadingRefine
    );
  }

  async function generateAndReview() {
    setLoadingCode(true);
    setError('');
    setLastAction('Generating + reviewing');
    const started = performance.now();

    try {
      const first = await fetch(
        `${API_BASE}/generate-code`,
        fetchOptions({ prompt, numSamples, code })
      );
      const firstPayload = await first.json();
      if (!first.ok) throw new Error(firstPayload.error || 'Code generation failed');

      setCode(firstPayload.code);

      const second = await fetch(
        `${API_BASE}/suggest-refine`,
        fetchOptions({ prompt, code: firstPayload.code })
      );
      const secondPayload = await second.json();
      if (!second.ok) throw new Error(secondPayload.error || 'Review failed');

      setMode('review');
      setSuggestion(secondPayload.suggestion);
      setEditableText(secondPayload.suggestion);
      setLastLatency(Math.round(performance.now() - started));
      setLastAction('Generate + review complete');
    } catch (e) {
      setError(e.message || 'Something went wrong');
      setLastAction('Request failed');
    } finally {
      setLoadingCode(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  }

  return (
    <div className={darkMode ? 'app dark' : 'app light'}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <img src={darkMode ? logoDark : logoLight} alt="" />
          </div>
          <div>
            <div className="brand-name">Codegen Studio</div>
            <div className="brand-subtitle">Build · inspect · improve</div>
          </div>
        </div>

        <div className="topbar-center">
          <span className="status-dot" />
          <span>{lastAction}</span>
          {lastLatency !== null && <span className="latency">{(lastLatency / 1000).toFixed(1)}s</span>}
        </div>

        <div className="topbar-actions">
          <div className="model-shell">
            <span className={`model-badge ${modelInfo.tone}`}>{modelInfo.badge}</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="model-select">
              <optgroup label="Best value">
                <option value="qwen/qwen3-coder-30b-a3b-instruct">Qwen3 Coder 30B</option>
                <option value="deepseek/deepseek-v3.2">DeepSeek V3.2</option>
                <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
              </optgroup>
              <optgroup label="Ultra cheap">
                <option value="openai/gpt-oss-20b">GPT-OSS 20B</option>
              </optgroup>
              <optgroup label="Long context">
                <option value="qwen/qwen3-coder-next">Qwen3 Coder Next</option>
                <option value="qwen/qwen3-coder-flash">Qwen3 Coder Flash</option>
              </optgroup>
              <optgroup label="Premium">
                <option value="z-ai/glm-5.3">GLM 5.3</option>
              </optgroup>
              <optgroup label="Direct OpenAI">
                <option value="gpt-4.1-nano">GPT-4.1 nano</option>
                <option value="gpt-4o-mini">GPT-4o mini</option>
              </optgroup>
            </select>
          </div>

          <button
            className="icon-btn"
            onClick={() => setDarkMode((prev) => !prev)}
            title="Toggle theme"
          >
            {darkMode ? '☾' : '☀'}
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="canvas">
          <div className="editor-card">
            <div className="editor-toolbar">
              <div className="editor-title">
                <span className="file-dot" />
                solution.py
                <span className="language-chip">Python</span>
              </div>
              <div className="editor-actions">
                <button className="ghost-btn" onClick={autoEnhance} disabled={!code || busy}>
                  ✦ Improve
                </button>
                <button className="ghost-btn" onClick={copyCode} disabled={!code}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="editor-wrap">
              <AceEditor
                mode="python"
                theme={darkMode ? 'twilight' : 'textmate'}
                value={code}
                onChange={setCode}
                name="python-editor"
                width="100%"
                height="100%"
                readOnly={loadingCode}
                setOptions={{
                  useWorker: false,
                  showPrintMargin: false,
                  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
                }}
                editorProps={{ $blockScrolling: true }}
                fontSize={14}
              />

              {!code && !busy && (
                <div className="editor-empty">
                  <div className="empty-orb">⌘</div>
                  <h2>Start with an idea</h2>
                  <p>Describe a function, algorithm, bug, or transformation below.</p>
                </div>
              )}

              {loadingCode && (
                <div className="editor-loading">
                  <Spinner />
                  <span>{lastAction}</span>
                </div>
              )}
            </div>
          </div>

          <div className="composer">
            <div className="composer-topline">
              <span className="composer-label">Prompt</span>
              <div className="sample-inline">
                <span>Samples</span>
                <button onClick={() => setNumSamples(Math.max(1, numSamples - 1))}>−</button>
                <strong>{numSamples}</strong>
                <button onClick={() => setNumSamples(numSamples + 1)}>+</button>
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to build or change…"
              disabled={busy}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim()) {
                  generateCode();
                }
              }}
            />

            {!prompt && (
              <div className="starter-row">
                {STARTERS.map((starter) => (
                  <button key={starter} onClick={() => setPrompt(starter)}>
                    {starter}
                  </button>
                ))}
              </div>
            )}

            <div className="composer-footer">
              <div className="model-detail">
                <span className={`model-badge ${modelInfo.tone}`}>{modelInfo.badge}</span>
                <span>{modelInfo.name}</span>
                <span className="muted">· {modelInfo.meta}</span>
              </div>

              <div className="composer-actions">
                <button
                  className="secondary-btn"
                  onClick={generateAndReview}
                  disabled={!prompt.trim() || busy}
                >
                  Generate + review
                </button>
                <button
                  className="primary-btn"
                  onClick={generateCode}
                  disabled={!prompt.trim() || busy}
                >
                  {loadingCode ? <Spinner /> : 'Generate'}
                  <span className="shortcut">⌘↵</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <strong>Request failed</strong>
              <span>{error}</span>
              <button onClick={() => setError('')}>×</button>
            </div>
          )}
        </section>

        <aside className="inspector">
          <div className="inspector-heading">
            <div>
              <span className="eyebrow">Inspector</span>
              <h2>Understand the output</h2>
            </div>
          </div>

          <div className="tab-row">
            <button className={mode === 'plan' ? 'active' : ''} onClick={generateScot} disabled={!prompt || busy}>
              Plan
            </button>
            <button className={mode === 'review' ? 'active' : ''} onClick={suggestRefinement} disabled={!code || busy}>
              Review
            </button>
            <button className={mode === 'test' ? 'active' : ''} onClick={prepareTestCases} disabled={!code || busy}>
              Tests
            </button>
            <button className={mode === 'explain' ? 'active' : ''} onClick={explainCode} disabled={!code || busy}>
              Explain
            </button>
          </div>

          <div className="inspector-body">
            {(loadingScot || loadingRefine) && (
              <div className="panel-loading">
                <Spinner />
                <span>{lastAction}</span>
              </div>
            )}

            {!loadingScot && !loadingRefine && !currentText && mode !== 'test' && (
              <div className="inspector-empty">
                <div className="inspector-icon">✦</div>
                <h3>{mode === 'plan' ? 'Plan before you code' : 'Inspect your solution'}</h3>
                <p>
                  {mode === 'plan'
                    ? 'Generate a structured solution plan, edit it if you want, then implement it.'
                    : 'Use the tabs above to review correctness, generate tests, or understand the code.'}
                </p>
                {mode === 'plan' && (
                  <button className="secondary-btn wide" onClick={generateScot} disabled={!prompt || busy}>
                    Generate plan
                  </button>
                )}
              </div>
            )}

            {!loadingScot && !loadingRefine && mode !== 'test' && currentText && (
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
                    if (isEditable) setCurrentText(editableText);
                    else setEditableText(currentText);
                    setIsEditable(!isEditable);
                  }}
                >
                  {isEditable ? 'Save' : 'Edit'}
                </button>
              </div>
            )}

            {mode === 'test' && (
              <div className="tests-panel">
                <div className="test-controls">
                  <select
                    value={selectedFunction}
                    onChange={(e) => setSelectedFunction(e.target.value)}
                    className="function-select"
                  >
                    {functionList.length === 0 && <option value="">No function detected</option>}
                    {functionList.map((fn) => (
                      <option key={fn} value={fn}>{fn}()</option>
                    ))}
                  </select>
                  <button
                    className="secondary-btn"
                    onClick={generateTestCases}
                    disabled={!selectedFunction || loadingRefine}
                  >
                    Generate tests
                  </button>
                </div>

                {suggestion && !loadingRefine && (
                  <div className="test-editor-wrapper">
                    <button
                      className="test-copy"
                      onClick={() => {
                        navigator.clipboard.writeText(suggestion);
                        setCopiedTest(true);
                        setTimeout(() => setCopiedTest(false), 1300);
                      }}
                    >
                      {copiedTest ? '✓ Copied' : 'Copy'}
                    </button>
                    <AceEditor
                      mode="python"
                      theme={darkMode ? 'twilight' : 'textmate'}
                      value={suggestion}
                      onChange={setSuggestion}
                      width="100%"
                      height="100%"
                      setOptions={{ useWorker: false, showPrintMargin: false }}
                      editorProps={{ $blockScrolling: true }}
                      fontSize={13}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="inspector-footer">
            {mode === 'plan' && scot && (
              <button className="primary-btn wide" onClick={implementScot} disabled={loadingCode}>
                Implement this plan
              </button>
            )}
            {mode === 'review' && suggestion && (
              <button className="primary-btn wide" onClick={refineFromSuggestion} disabled={loadingCode}>
                Apply suggested fixes
              </button>
            )}
            {mode === 'explain' && suggestion && (
              <button className="secondary-btn wide" onClick={addComments} disabled={loadingCode}>
                Add comments to code
              </button>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

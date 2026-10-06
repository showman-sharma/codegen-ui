import React, { useMemo, useState } from 'react';
import AceEditor from 'react-ace';

const API_BASE = (process.env.REACT_APP_API_URL || '') + '/api';

const MODEL_PRESETS = [
  {
    key: 'managed-qwen',
    provider: 'server',
    model: 'qwen/qwen3-coder-30b-a3b-instruct',
    label: 'Qwen3 Coder 30B',
    note: 'Balanced default',
  },
  {
    key: 'managed-deepseek',
    provider: 'server',
    model: 'deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    note: 'Strong reasoning',
  },
  {
    key: 'managed-gptoss20',
    provider: 'server',
    model: 'openai/gpt-oss-20b',
    label: 'GPT-OSS 20B',
    note: 'Ultra-low cost',
  },
  {
    key: 'managed-gptoss120',
    provider: 'server',
    model: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    note: 'Value reasoning',
  },
];

const PROBLEM_PRESETS = [
  {
    label: 'Longest subarray',
    value:
      'Write a Python function def longest_subarray_sum_k(nums, k) that returns the length of the longest contiguous subarray whose sum equals k. Use O(n) expected time, support negative numbers, and return 0 if no such subarray exists.',
  },
  {
    label: 'LRU cache',
    value:
      'Implement a Python class LRUCache with get(key) and put(key, value). Both operations must run in O(1) expected time. The cache has a positive integer capacity and get returns -1 for a missing key.',
  },
  {
    label: 'Merge intervals',
    value:
      'Write a Python function def merge_intervals(intervals) that merges overlapping closed integer intervals and returns the merged intervals sorted by start value. Handle an empty input.',
  },
];

function providerLabel(provider) {
  if (provider === 'server') return 'Managed';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'openai') return 'OpenAI';
  return provider || 'Provider';
}

function candidateName(candidate) {
  return candidate?.modelLabel || candidate?.label || candidate?.model || 'Model';
}

function actionLabel(action) {
  return (
    {
      ACCEPT_PROVISIONALLY: 'Keep the code',
      ACQUIRE_MORE_EVIDENCE: 'Verify more',
      REPAIR: 'Repair justified',
      ACCEPT_AFTER_REPAIR: 'Keep repaired code',
      STOP_UNRESOLVED: 'Stop — evidence unclear',
      GENERATION_FAILED: 'Generation failed',
    }[action] ||
    action ||
    '—'
  );
}

function actionTone(action) {
  if (action?.includes('ACCEPT')) return 'pass';
  if (action === 'REPAIR') return 'warn';
  if (action === 'ACQUIRE_MORE_EVIDENCE') return 'verify';
  if (action === 'STOP_UNRESOLVED' || action === 'GENERATION_FAILED') return 'fail';
  return 'neutral';
}

function outcomeTone(outcome) {
  if (outcome === 'RECOVERY' || outcome === 'SAFE') return 'pass';
  if (outcome === 'HARM') return 'fail';
  if (outcome === 'WASTED') return 'warn';
  return 'neutral';
}

function evidenceSummary(candidate) {
  const evidence = candidate?.initialEvidence || [];
  if (!evidence.length) return 'No verifier result';
  const passed = evidence.filter((item) => item.passed === true).length;
  const failed = evidence.filter((item) => item.passed === false).length;
  return `${passed} pass · ${failed} fail`;
}

function decisionCopy(candidate) {
  const action = candidate?.controller?.action;
  if (action === 'ACCEPT_PROVISIONALLY') {
    return {
      title: 'The evidence says: keep this candidate.',
      body: candidate.controller.reason,
    };
  }
  if (action === 'REPAIR') {
    return {
      title: 'The failure is corroborated, so repair is justified.',
      body: candidate.controller.reason,
    };
  }
  if (action === 'ACQUIRE_MORE_EVIDENCE') {
    return {
      title: 'Do not repair yet.',
      body: candidate.controller.reason,
    };
  }
  if (action === 'STOP_UNRESOLVED') {
    return {
      title: 'CodeGen stopped instead of guessing.',
      body: candidate.controller.reason,
    };
  }
  if (action === 'GENERATION_FAILED') {
    return {
      title: 'This candidate could not be generated.',
      body: candidate.controller.reason,
    };
  }
  return {
    title: 'Controller result',
    body: candidate?.controller?.reason || 'No controller rationale available.',
  };
}

export default function LabView({ darkMode }) {
  const [prompt, setPrompt] = useState(PROBLEM_PRESETS[0].value);
  const [modelConfigs, setModelConfigs] = useState([
    MODEL_PRESETS[0],
    MODEL_PRESETS[1],
  ]);
  const [strategies, setStrategies] = useState(['direct', 'plan']);
  const [showAddModel, setShowAddModel] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [trustedTests, setTrustedTests] = useState('');
  const [newModel, setNewModel] = useState({
    provider: 'openrouter',
    model: '',
    label: '',
    apiKey: '',
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');

  const candidateCount = modelConfigs.length * strategies.length;
  const selectedCandidate = result?.candidates?.[selected] || null;
  const selectedDecision = decisionCopy(selectedCandidate);
  const validCandidates = useMemo(
    () => result?.candidates?.filter((candidate) => !candidate.generationError) || [],
    [result]
  );

  function toggleManaged(preset) {
    setModelConfigs((current) => {
      const exists = current.some((item) => item.key === preset.key);
      if (exists) return current.filter((item) => item.key !== preset.key);
      if (current.length >= 4) return current;
      return [...current, preset];
    });
  }

  function removeModel(key) {
    setModelConfigs((current) => current.filter((item) => item.key !== key));
  }

  function toggleStrategy(strategy) {
    setStrategies((current) =>
      current.includes(strategy)
        ? current.filter((item) => item !== strategy)
        : [...current, strategy]
    );
  }

  function addByokModel() {
    const model = newModel.model.trim();
    const apiKey = newModel.apiKey.trim();
    if (!model || !apiKey || modelConfigs.length >= 4) return;

    setModelConfigs((current) => [
      ...current,
      {
        key: `byok-${Date.now()}`,
        provider: newModel.provider,
        model,
        label: newModel.label.trim() || model,
        apiKey,
        note: 'Your key · session only',
      },
    ]);
    setNewModel({
      provider: 'openrouter',
      model: '',
      label: '',
      apiKey: '',
    });
    setShowAddModel(false);
  }

  async function runExperiment() {
    setRunning(true);
    setError('');
    setResult(null);
    setSelected(0);

    try {
      const response = await fetch(`${API_BASE}/lab/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelConfigs,
          strategies,
          trustedTests,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Experiment failed');

      setResult(payload);
    } catch (e) {
      setError(e.message || 'Experiment failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="lab-pro-page">
      <section className="lab-pro-header">
        <div>
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" />
            Evidence-aware lab
          </div>
          <h1>Find out when code should be repaired — and when it should be left alone.</h1>
          <p>
            CodeGen generates candidates, checks them with independent executable evidence, and
            blocks repair when the verifier story is weak or contradictory.
          </p>
        </div>

        <div className="policy-summary">
          <span className="policy-summary-label">Controller policy</span>
          <div className="policy-mini-flow">
            <span>Verify twice</span>
            <b>→</b>
            <span>Resolve disagreement</span>
            <b>→</b>
            <span>Repair only if justified</span>
          </div>
        </div>
      </section>

      <section className="lab-pro-layout">
        <div className="lab-setup-card">
          <div className="setup-card-heading">
            <div>
              <span className="step-kicker">Experiment setup</span>
              <h2>Configure one run</h2>
            </div>
            <span className="setup-ready-pill">{candidateCount} candidates</span>
          </div>

          <div className="setup-section">
            <div className="setup-section-title">
              <span className="setup-number">1</span>
              <div>
                <strong>What should the models solve?</strong>
                <small>Start from an example or paste your own Python task.</small>
              </div>
            </div>

            <div className="preset-row">
              {PROBLEM_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={prompt === preset.value ? 'preset-chip active' : 'preset-chip'}
                  onClick={() => setPrompt(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <textarea
              className="pro-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the function, constraints, and expected behavior…"
            />
          </div>

          <div className="setup-section">
            <div className="setup-section-title">
              <span className="setup-number">2</span>
              <div>
                <strong>Which models should participate?</strong>
                <small>Use the managed demo models or add your own provider key.</small>
              </div>
            </div>

            <div className="managed-label-row">
              <span>Managed models</span>
              <span>{modelConfigs.length}/4 selected</span>
            </div>

            <div className="model-picker-grid">
              {MODEL_PRESETS.map((preset) => {
                const active = modelConfigs.some((item) => item.key === preset.key);
                return (
                  <button
                    className={active ? 'pro-model-card active' : 'pro-model-card'}
                    key={preset.key}
                    onClick={() => toggleManaged(preset)}
                    type="button"
                  >
                    <span className="model-select-check">{active ? '✓' : ''}</span>
                    <div>
                      <strong>{preset.label}</strong>
                      <small>{preset.note}</small>
                    </div>
                    <span className="provider-pill">Managed</span>
                  </button>
                );
              })}
            </div>

            {modelConfigs.some((item) => item.provider !== 'server') && (
              <div className="custom-model-list">
                {modelConfigs
                  .filter((item) => item.provider !== 'server')
                  .map((item) => (
                    <div className="custom-model-row" key={item.key}>
                      <div className="custom-model-icon">⌁</div>
                      <div>
                        <strong>{item.label}</strong>
                        <small>
                          {providerLabel(item.provider)} · {item.model}
                        </small>
                      </div>
                      <span className="session-pill">session only</span>
                      <button type="button" onClick={() => removeModel(item.key)}>
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {!showAddModel ? (
              <button
                className="add-model-button"
                type="button"
                onClick={() => setShowAddModel(true)}
                disabled={modelConfigs.length >= 4}
              >
                <span>＋</span>
                Bring your own model
                <small>OpenRouter or OpenAI</small>
              </button>
            ) : (
              <div className="byok-panel">
                <div className="byok-panel-head">
                  <div>
                    <strong>Add a model</strong>
                    <small>Your key stays in this browser session and is sent only with the run.</small>
                  </div>
                  <button type="button" onClick={() => setShowAddModel(false)}>
                    ×
                  </button>
                </div>

                <div className="byok-fields">
                  <label>
                    <span>Provider</span>
                    <select
                      value={newModel.provider}
                      onChange={(e) =>
                        setNewModel((current) => ({
                          ...current,
                          provider: e.target.value,
                        }))
                      }
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="openai">OpenAI</option>
                    </select>
                  </label>

                  <label>
                    <span>Model ID</span>
                    <input
                      value={newModel.model}
                      onChange={(e) =>
                        setNewModel((current) => ({
                          ...current,
                          model: e.target.value,
                        }))
                      }
                      placeholder={
                        newModel.provider === 'openrouter'
                          ? 'e.g. qwen/qwen3-coder-30b-a3b-instruct'
                          : 'e.g. gpt-4.1-mini'
                      }
                    />
                  </label>

                  <label>
                    <span>Display name <em>optional</em></span>
                    <input
                      value={newModel.label}
                      onChange={(e) =>
                        setNewModel((current) => ({
                          ...current,
                          label: e.target.value,
                        }))
                      }
                      placeholder="My coding model"
                    />
                  </label>

                  <label>
                    <span>API key</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={newModel.apiKey}
                      onChange={(e) =>
                        setNewModel((current) => ({
                          ...current,
                          apiKey: e.target.value,
                        }))
                      }
                      placeholder={
                        newModel.provider === 'openrouter' ? 'sk-or-v1-…' : 'sk-…'
                      }
                    />
                  </label>
                </div>

                <div className="byok-security-note">
                  <span>◉</span>
                  <p>
                    CodeGen does not save this key to localStorage, Railway, GitHub, or a database.
                    It is sent over HTTPS only with this experiment request.
                  </p>
                </div>

                <div className="byok-actions">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => setShowAddModel(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={addByokModel}
                    disabled={!newModel.model.trim() || !newModel.apiKey.trim()}
                  >
                    Add model
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="setup-section">
            <div className="setup-section-title">
              <span className="setup-number">3</span>
              <div>
                <strong>How should candidates be generated?</strong>
                <small>Use one strategy or compare both.</small>
              </div>
            </div>

            <div className="strategy-pro-grid">
              <button
                className={strategies.includes('direct') ? 'strategy-pro-card active' : 'strategy-pro-card'}
                onClick={() => toggleStrategy('direct')}
                type="button"
              >
                <span className="strategy-icon">→</span>
                <div>
                  <strong>Direct</strong>
                  <p>Problem → code</p>
                  <small>Fastest baseline · one generation call</small>
                </div>
              </button>

              <button
                className={strategies.includes('plan') ? 'strategy-pro-card active' : 'strategy-pro-card'}
                onClick={() => toggleStrategy('plan')}
                type="button"
              >
                <span className="strategy-icon">⌘</span>
                <div>
                  <strong>Plan → Code</strong>
                  <p>Problem → structured plan → implementation</p>
                  <small>More inference compute before coding</small>
                </div>
              </button>
            </div>
          </div>

          <div className="advanced-block">
            <button
              type="button"
              className="advanced-toggle"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              <span>
                <strong>Advanced research controls</strong>
                <small>Trusted tests for recovery / harm accounting</small>
              </span>
              <span>{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="advanced-body">
                <div className="oracle-explainer">
                  <strong>Trusted tests are an oracle, not controller evidence.</strong>
                  <p>
                    CodeGen runs them before and after the controller acts, but never reveals the
                    result to the controller. This lets research runs measure whether an intervention
                    actually recovered a failure or harmed correct code.
                  </p>
                </div>

                <textarea
                  className="trusted-tests-input"
                  value={trustedTests}
                  onChange={(e) => setTrustedTests(e.target.value)}
                  placeholder={'def check(func):\n    assert func(...) == ...'}
                />
              </div>
            )}
          </div>

          <div className="run-preview">
            <div className="run-preview-copy">
              <span className="step-kicker">What happens when you run</span>
              <div className="run-preview-flow">
                <span>Generate {candidateCount}</span>
                <b>→</b>
                <span>Verify ×2</span>
                <b>→</b>
                <span>Escalate disagreement</span>
                <b>→</b>
                <span>Gate repair</span>
              </div>
            </div>

            <button
              className="run-primary"
              type="button"
              onClick={runExperiment}
              disabled={
                running ||
                !prompt.trim() ||
                modelConfigs.length === 0 ||
                strategies.length === 0
              }
            >
              {running ? (
                <>
                  <span className="inline-spinner" />
                  Running experiment
                </>
              ) : (
                <>
                  Run experiment
                  <span>→</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="pro-error">
              <strong>Experiment could not finish</strong>
              <span>{error}</span>
              <button type="button" onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
        </div>

        <div className="lab-results-card">
          {!result && !running && (
            <div className="results-empty-pro">
              <div className="results-illustration">
                <div className="ri-node">Code</div>
                <div className="ri-line" />
                <div className="ri-split">
                  <span>Verifier A</span>
                  <span>Verifier B</span>
                </div>
                <div className="ri-line short" />
                <div className="ri-controller">Controller</div>
              </div>
              <h2>Your experiment will appear here.</h2>
              <p>
                Start with the defaults if you just want to see it work. The interesting part is not
                whether a model can write code — it is whether the evidence justifies changing that code.
              </p>
              <div className="empty-hints">
                <span>✓ Same task across every candidate</span>
                <span>✓ Independent executable verifier suites</span>
                <span>✓ Repair blocked on weak evidence</span>
              </div>
            </div>
          )}

          {running && (
            <div className="results-empty-pro running-state">
              <span className="lab-big-spinner" />
              <h2>Running the evidence pipeline</h2>
              <p>
                Candidate generation and verifier work run in parallel. Slow providers can still take
                up to the request timeout.
              </p>
              <div className="running-stages">
                <span className="active">Generate candidates</span>
                <span>Build verifier evidence</span>
                <span>Resolve disagreement</span>
                <span>Repair if justified</span>
              </div>
            </div>
          )}

          {result && (
            <div className="results-pro">
              <div className="results-pro-head">
                <div>
                  <span className="step-kicker">Experiment complete</span>
                  <h2>What did the controller do?</h2>
                </div>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setSelected(0);
                  }}
                >
                  New run
                </button>
              </div>

              {result.warning && <div className="result-warning">{result.warning}</div>}

              <div className="metric-cards">
                <div>
                  <span>Kept unchanged</span>
                  <strong>{result.summary?.acceptedWithoutRepair || 0}</strong>
                  <small>evidence supported the candidate</small>
                </div>
                <div>
                  <span>Evidence escalations</span>
                  <strong>{result.summary?.evidenceEscalations || 0}</strong>
                  <small>verifiers initially disagreed</small>
                </div>
                <div>
                  <span>Repairs attempted</span>
                  <strong>{result.summary?.repairsAttempted || 0}</strong>
                  <small>failure was corroborated</small>
                </div>
                <div>
                  <span>Unresolved</span>
                  <strong>{result.summary?.unresolved || 0}</strong>
                  <small>CodeGen refused to guess</small>
                </div>
              </div>

              {result.trustedTestsProvided && (
                <div className="oracle-metrics">
                  <div>
                    <span>Recoveries</span>
                    <strong>{result.summary?.recoveries || 0}</strong>
                  </div>
                  <div>
                    <span>Harms</span>
                    <strong>{result.summary?.harms || 0}</strong>
                  </div>
                  <p>
                    These two metrics come only from trusted tests hidden from the controller.
                  </p>
                </div>
              )}

              <div className="candidate-selector">
                {result.candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.key}-${candidate.strategy}`}
                    type="button"
                    className={selected === index ? 'candidate-chip active' : 'candidate-chip'}
                    onClick={() => setSelected(index)}
                  >
                    <div>
                      <strong>{candidateName(candidate)}</strong>
                      <small>
                        {candidate.strategy === 'plan' ? 'Plan → Code' : 'Direct'} ·{' '}
                        {providerLabel(candidate.provider)}
                      </small>
                    </div>
                    <span className={`verdict ${actionTone(candidate.finalDecision)}`}>
                      {actionLabel(candidate.finalDecision)}
                    </span>
                  </button>
                ))}
              </div>

              {selectedCandidate && (
                <div className="selected-result">
                  <div className={`decision-banner ${actionTone(selectedCandidate.controller?.action)}`}>
                    <div className="decision-icon">
                      {selectedCandidate.controller?.action === 'ACCEPT_PROVISIONALLY'
                        ? '✓'
                        : selectedCandidate.controller?.action === 'REPAIR'
                        ? '↻'
                        : selectedCandidate.controller?.action === 'ACQUIRE_MORE_EVIDENCE'
                        ? '?'
                        : '◇'}
                    </div>
                    <div>
                      <span className="step-kicker">Controller decision</span>
                      <h3>{selectedDecision.title}</h3>
                      <p>{selectedDecision.body}</p>
                    </div>
                  </div>

                  {!selectedCandidate.generationError && (
                    <>
                      <div className="trajectory-pro">
                        <div className="trajectory-pro-node">
                          <span>1</span>
                          <div>
                            <strong>Generated</strong>
                            <small>{(selectedCandidate.generationMs / 1000).toFixed(1)}s</small>
                          </div>
                        </div>
                        <b>→</b>
                        <div className="trajectory-pro-node">
                          <span>2</span>
                          <div>
                            <strong>Verified</strong>
                            <small>{evidenceSummary(selectedCandidate)}</small>
                          </div>
                        </div>
                        <b>→</b>
                        <div className="trajectory-pro-node accent">
                          <span>3</span>
                          <div>
                            <strong>{actionLabel(selectedCandidate.controller?.action)}</strong>
                            <small>{selectedCandidate.controller?.verifierTrust}</small>
                          </div>
                        </div>
                        {selectedCandidate.repair?.attempted && (
                          <>
                            <b>→</b>
                            <div className="trajectory-pro-node warn">
                              <span>4</span>
                              <div>
                                <strong>Repaired + reverified</strong>
                                <small>
                                  {(selectedCandidate.repair.generationMs / 1000).toFixed(1)}s
                                </small>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="verifier-pro-grid">
                        {(selectedCandidate.initialEvidence || []).map((item) => (
                          <div
                            className={`verifier-pro-card ${item.passed ? 'passed' : 'failed'}`}
                            key={item.suiteId}
                          >
                            <div className="verifier-pro-head">
                              <div>
                                <strong>{item.suiteLabel}</strong>
                                <small>{candidateName(item)}</small>
                              </div>
                              <span>{item.passed ? 'PASS' : 'FAIL'}</span>
                            </div>
                            <pre>{item.stderr || item.stdout || 'No diagnostic output.'}</pre>
                          </div>
                        ))}
                      </div>

                      {selectedCandidate.repair?.attempted && (
                        <div className="repair-pro-section">
                          <div className="section-inline-heading">
                            <div>
                              <span className="step-kicker">After intervention</span>
                              <h3>Did the repaired code satisfy the same evidence?</h3>
                            </div>
                          </div>
                          <div className="verifier-pro-grid">
                            {(selectedCandidate.repair.evidence || []).map((item) => (
                              <div
                                className={`verifier-pro-card ${item.passed ? 'passed' : 'failed'}`}
                                key={item.suiteId}
                              >
                                <div className="verifier-pro-head">
                                  <strong>{item.suiteLabel}</strong>
                                  <span>{item.passed ? 'PASS' : 'FAIL'}</span>
                                </div>
                                <pre>{item.stderr || item.stdout || 'No diagnostic output.'}</pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.trustedTestsProvided && (
                        <div className="oracle-result-pro">
                          <div>
                            <span>Trusted initial</span>
                            <strong>{selectedCandidate.trustedInitial?.passed ? 'PASS' : 'FAIL'}</strong>
                          </div>
                          <b>→</b>
                          <div>
                            <span>Trusted final</span>
                            <strong>{selectedCandidate.trustedFinal?.passed ? 'PASS' : 'FAIL'}</strong>
                          </div>
                          <span className={`oracle-outcome ${outcomeTone(selectedCandidate.interventionOutcome)}`}>
                            {selectedCandidate.interventionOutcome || 'NO INTERVENTION'}
                          </span>
                        </div>
                      )}

                      <details className="code-comparison" open>
                        <summary>Inspect generated code</summary>
                        <div className="code-comparison-grid">
                          <div>
                            <div className="detail-label">Initial candidate</div>
                            <AceEditor
                              mode="python"
                              theme={darkMode ? 'twilight' : 'textmate'}
                              value={selectedCandidate.code}
                              readOnly
                              width="100%"
                              height="300px"
                              setOptions={{ useWorker: false, showPrintMargin: false }}
                              fontSize={13}
                            />
                          </div>
                          <div>
                            <div className="detail-label">
                              {selectedCandidate.repair?.attempted
                                ? 'Final code after repair'
                                : 'Final code · unchanged'}
                            </div>
                            <AceEditor
                              mode="python"
                              theme={darkMode ? 'twilight' : 'textmate'}
                              value={selectedCandidate.repair?.code || selectedCandidate.code}
                              readOnly
                              width="100%"
                              height="300px"
                              setOptions={{ useWorker: false, showPrintMargin: false }}
                              fontSize={13}
                            />
                          </div>
                        </div>
                      </details>
                    </>
                  )}

                  {selectedCandidate.generationError && (
                    <div className="generation-error-pro">
                      <strong>Model generation failed</strong>
                      <pre>{selectedCandidate.generationError}</pre>
                    </div>
                  )}
                </div>
              )}

              <details className="technical-details">
                <summary>
                  Technical details
                  <span>Verifier suites, provenance, and generated test code</span>
                </summary>
                <div className="technical-body">
                  <p>
                    Generated verifier suites can influence controller decisions, so CodeGen keeps
                    their provenance visible. They are evidence, not ground truth.
                  </p>

                  {(result.testSuites || []).map((suite) => (
                    <details className="generated-tests" key={suite.id}>
                      <summary>
                        {suite.label} · {suite.label || suite.model} ·{' '}
                        {suite.available ? 'available' : 'unavailable'}
                      </summary>
                      {suite.available ? (
                        <AceEditor
                          mode="python"
                          theme={darkMode ? 'twilight' : 'textmate'}
                          value={suite.tests}
                          readOnly
                          width="100%"
                          height="230px"
                          setOptions={{ useWorker: false, showPrintMargin: false }}
                          fontSize={12}
                        />
                      ) : (
                        <div className="suite-error">{suite.error}</div>
                      )}
                    </details>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

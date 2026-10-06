import React, { useMemo, useState } from 'react';
import AceEditor from 'react-ace';

const API_BASE = (process.env.REACT_APP_API_URL || '') + '/api';

const LAB_MODELS = [
  { id: 'qwen/qwen3-coder-30b-a3b-instruct', name: 'Qwen3 Coder 30B', note: 'default value pick' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', note: 'strong reasoning' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', note: 'ultra cheap' },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', note: 'cheap reasoning' },
];

const STARTER =
  'Write a Python function def longest_subarray_sum_k(nums, k) that returns the length of the longest contiguous subarray whose sum equals k. Use O(n) expected time, support negative numbers, and return 0 if no such subarray exists.';

function shortModel(id) {
  return LAB_MODELS.find((m) => m.id === id)?.name || id;
}

function actionLabel(action) {
  return {
    ACCEPT_PROVISIONALLY: 'Accept',
    ACQUIRE_MORE_EVIDENCE: 'Verify more',
    REPAIR: 'Repair',
    ACCEPT_AFTER_REPAIR: 'Accept after repair',
    STOP_UNRESOLVED: 'Stop unresolved',
    GENERATION_FAILED: 'Generation failed',
  }[action] || action || '—';
}

function actionTone(action) {
  if (action?.includes('ACCEPT')) return 'pass';
  if (action === 'REPAIR') return 'warn';
  if (action === 'ACQUIRE_MORE_EVIDENCE') return 'verify';
  if (action === 'STOP_UNRESOLVED' || action === 'GENERATION_FAILED') return 'fail';
  return 'neutral';
}

function evidenceSummary(candidate) {
  const evidence = candidate.initialEvidence || [];
  if (!evidence.length) return 'No evidence';
  const pass = evidence.filter((item) => item.passed === true).length;
  const fail = evidence.filter((item) => item.passed === false).length;
  return `${pass} pass · ${fail} fail`;
}

function outcomeTone(outcome) {
  if (outcome === 'RECOVERY' || outcome === 'SAFE') return 'pass';
  if (outcome === 'HARM') return 'fail';
  if (outcome === 'WASTED') return 'warn';
  return 'neutral';
}

export default function LabView({ darkMode }) {
  const [prompt, setPrompt] = useState(STARTER);
  const [models, setModels] = useState([
    'qwen/qwen3-coder-30b-a3b-instruct',
    'deepseek/deepseek-v3.2',
  ]);
  const [strategies, setStrategies] = useState(['direct', 'plan']);
  const [trustedTests, setTrustedTests] = useState('');
  const [showTrustedTests, setShowTrustedTests] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');

  const selectedCandidate = result?.candidates?.[selected] || null;
  const validCandidates = useMemo(
    () => result?.candidates?.filter((candidate) => !candidate.generationError) || [],
    [result]
  );

  function toggleModel(id) {
    setModels((current) => {
      if (current.includes(id)) return current.filter((m) => m !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  function toggleStrategy(id) {
    setStrategies((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    );
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
        body: JSON.stringify({ prompt, models, strategies, trustedTests }),
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
    <main className="lab-workspace evidence-aware">
      <section className="lab-config">
        <div className="lab-kicker">Verifier-aware code inference</div>
        <h1>Know when not to repair.</h1>
        <p className="lab-lede">
          CodeGen verifies generated programs with independent evidence first. It spends more
          inference only when verifiers disagree, and permits repair only after failure evidence is
          corroborated.
        </p>

        <div className="controller-policy-card">
          <span className="policy-dot" />
          <div>
            <strong>Evidence-aware controller</strong>
            <small>verify ×2 → escalate on disagreement → repair only on corroborated failure</small>
          </div>
        </div>

        <div className="lab-section">
          <div className="lab-section-head">
            <span>01</span>
            <div>
              <strong>Problem</strong>
              <small>Function-level Python tasks are the current experimental surface.</small>
            </div>
          </div>
          <textarea
            className="lab-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the programming problem..."
          />
        </div>

        <div className="lab-section">
          <div className="lab-section-head">
            <span>02</span>
            <div>
              <strong>Candidate generators</strong>
              <small>Select up to four models. The first two also act as independent verifiers.</small>
            </div>
          </div>
          <div className="lab-choice-grid">
            {LAB_MODELS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={models.includes(item.id) ? 'lab-choice selected' : 'lab-choice'}
                onClick={() => toggleModel(item.id)}
              >
                <span className="lab-check">{models.includes(item.id) ? '✓' : ''}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.note}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lab-section">
          <div className="lab-section-head">
            <span>03</span>
            <div>
              <strong>Generation strategies</strong>
              <small>Compare the initial candidate before verifier-aware control.</small>
            </div>
          </div>
          <div className="lab-strategies">
            <button
              className={strategies.includes('direct') ? 'strategy-card selected' : 'strategy-card'}
              onClick={() => toggleStrategy('direct')}
            >
              <strong>Direct</strong>
              <span>Problem → code</span>
              <small>1 generation call</small>
            </button>
            <button
              className={strategies.includes('plan') ? 'strategy-card selected' : 'strategy-card'}
              onClick={() => toggleStrategy('plan')}
            >
              <strong>Plan → Code</strong>
              <span>Problem → structured plan → code</span>
              <small>2 generation calls</small>
            </button>
          </div>
        </div>

        <div className="lab-section research-section">
          <button
            className="research-toggle"
            type="button"
            onClick={() => setShowTrustedTests((value) => !value)}
          >
            <span>
              <strong>04 · Trusted tests</strong>
              <small>Optional research-only oracle. Never shown to the controller.</small>
            </span>
            <span>{showTrustedTests ? '−' : '+'}</span>
          </button>

          {showTrustedTests && (
            <div className="trusted-tests-panel">
              <div className="oracle-warning">
                Evaluation only. These tests are executed on the initial and final program after the
                controller acts, but their result is never used to choose verify / repair / stop.
              </div>
              <textarea
                value={trustedTests}
                onChange={(e) => setTrustedTests(e.target.value)}
                placeholder={'def check(func):\n    assert func(...) == ...'}
              />
              <small>
                With trusted tests, CodeGen can measure RECOVERY, HARM, SAFE, and WASTED interventions.
              </small>
            </div>
          )}
        </div>

        <div className="lab-run-row">
          <div>
            <span className="lab-run-count">
              {models.length * strategies.length} candidate
              {models.length * strategies.length === 1 ? '' : 's'}
            </span>
            <small>
              2 verifiers initially · third verifier only on disagreement
              {trustedTests.trim() ? ' · oracle accounting enabled' : ''}
            </small>
          </div>
          <button
            className="primary-btn lab-run"
            onClick={runExperiment}
            disabled={running || !prompt.trim() || models.length === 0 || strategies.length === 0}
          >
            {running ? 'Running controller…' : 'Run evidence-aware experiment'}
          </button>
        </div>

        {error && <div className="lab-error">{error}</div>}
      </section>

      <section className="lab-results">
        {!result && !running && (
          <div className="lab-empty evidence-empty">
            <div className="lab-empty-mark">⊢</div>
            <h2>Evidence before intervention.</h2>
            <p>
              A failing self-test is not permission to rewrite code. CodeGen asks whether independent
              verification agrees first, escalates evidence when it does not, and only then decides
              whether repair is justified.
            </p>
            <div className="evidence-flow-preview">
              <span>Candidate</span><b>→</b><span>Verifier A</span><b>+</b><span>Verifier B</span>
              <b>→</b><span>Accept / Verify more / Repair</span>
            </div>
          </div>
        )}

        {running && (
          <div className="lab-empty">
            <span className="lab-big-spinner" />
            <h2>Running the controller</h2>
            <p>
              Generating candidates, collecting two independent evidence sources, escalating only
              disagreements, then gating repair.
            </p>
          </div>
        )}

        {result && (
          <div className="experiment-result">
            <div className="experiment-summary evidence-summary-head">
              <div>
                <span className="lab-kicker">Controller run</span>
                <h2>{validCandidates.length} candidate trajectories</h2>
              </div>
              <div className="summary-chips">
                <span>{result.summary?.acceptedWithoutRepair || 0} accepted</span>
                <span>{result.summary?.evidenceEscalations || 0} escalated</span>
                <span>{result.summary?.repairsAttempted || 0} repaired</span>
                {result.trustedTestsProvided && (
                  <>
                    <span className="good">{result.summary?.recoveries || 0} recoveries</span>
                    <span className="bad">{result.summary?.harms || 0} harms</span>
                  </>
                )}
              </div>
            </div>

            <div className="result-table-wrap">
              <table className="result-table evidence-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Model</th>
                    <th>Strategy</th>
                    <th>Evidence</th>
                    <th>Controller</th>
                    <th>Final</th>
                    {result.trustedTestsProvided && <th>Oracle outcome</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((candidate, index) => (
                    <tr
                      key={`${candidate.model}-${candidate.strategy}`}
                      className={selected === index ? 'active' : ''}
                      onClick={() => setSelected(index)}
                    >
                      <td>#{index + 1}</td>
                      <td>{shortModel(candidate.model)}</td>
                      <td>{candidate.strategy === 'plan' ? 'Plan → Code' : 'Direct'}</td>
                      <td>{candidate.generationError ? 'generation failed' : evidenceSummary(candidate)}</td>
                      <td>
                        <span className={`verdict ${actionTone(candidate.controller?.action)}`}>
                          {actionLabel(candidate.controller?.action)}
                        </span>
                      </td>
                      <td>{actionLabel(candidate.finalDecision)}</td>
                      {result.trustedTestsProvided && (
                        <td>
                          <span className={`verdict ${outcomeTone(candidate.interventionOutcome)}`}>
                            {candidate.interventionOutcome || '—'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedCandidate && (
              <div className="trajectory-card">
                <div className="trajectory-head">
                  <div>
                    <span className="lab-kicker">Candidate #{selected + 1}</span>
                    <h3>
                      {shortModel(selectedCandidate.model)} ·{' '}
                      {selectedCandidate.strategy === 'plan' ? 'Plan → Code' : 'Direct'}
                    </h3>
                  </div>
                  <span className={`verdict ${actionTone(selectedCandidate.finalDecision)}`}>
                    {actionLabel(selectedCandidate.finalDecision)}
                  </span>
                </div>

                {selectedCandidate.generationError ? (
                  <div className="trajectory-error">{selectedCandidate.generationError}</div>
                ) : (
                  <>
                    <div className="trajectory-strip">
                      <div className="trajectory-node">
                        <span>1</span>
                        <div>
                          <strong>Generate</strong>
                          <small>{(selectedCandidate.generationMs / 1000).toFixed(1)}s</small>
                        </div>
                      </div>
                      <div className="trajectory-arrow">→</div>
                      <div className="trajectory-node wide-node">
                        <span>2</span>
                        <div>
                          <strong>Collect evidence</strong>
                          <small>{evidenceSummary(selectedCandidate)}</small>
                        </div>
                      </div>
                      <div className="trajectory-arrow">→</div>
                      <div className="trajectory-node controller-node">
                        <span>3</span>
                        <div>
                          <strong>{actionLabel(selectedCandidate.controller?.action)}</strong>
                          <small>{selectedCandidate.controller?.verifierTrust}</small>
                        </div>
                      </div>
                      {selectedCandidate.repair?.attempted && (
                        <>
                          <div className="trajectory-arrow">→</div>
                          <div className="trajectory-node repair-node">
                            <span>4</span>
                            <div>
                              <strong>Repair + reverify</strong>
                              <small>{(selectedCandidate.repair.generationMs / 1000).toFixed(1)}s</small>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="controller-reason">
                      <strong>Controller rationale</strong>
                      <span>{selectedCandidate.controller?.reason}</span>
                    </div>

                    <div className="evidence-grid">
                      {(selectedCandidate.initialEvidence || []).map((item) => (
                        <div className={`verifier-card ${item.passed ? 'passed' : 'failed'}`} key={item.suiteId}>
                          <div className="verifier-card-head">
                            <span>{item.suiteLabel}</span>
                            <strong>{item.passed ? 'PASS' : 'FAIL'}</strong>
                          </div>
                          <small>{shortModel(item.model)}</small>
                          <pre>{item.stderr || item.stdout || 'No diagnostic output.'}</pre>
                        </div>
                      ))}
                    </div>

                    {selectedCandidate.repair?.attempted && (
                      <div className="repair-evidence-block">
                        <div className="detail-label">After gated repair</div>
                        <div className="evidence-grid">
                          {(selectedCandidate.repair.evidence || []).map((item) => (
                            <div className={`verifier-card ${item.passed ? 'passed' : 'failed'}`} key={item.suiteId}>
                              <div className="verifier-card-head">
                                <span>{item.suiteLabel}</span>
                                <strong>{item.passed ? 'PASS' : 'FAIL'}</strong>
                              </div>
                              <pre>{item.stderr || item.stdout || 'No diagnostic output.'}</pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.trustedTestsProvided && (
                      <div className="oracle-card">
                        <div>
                          <span>Hidden/trusted initial</span>
                          <strong>{selectedCandidate.trustedInitial?.passed ? 'PASS' : 'FAIL'}</strong>
                        </div>
                        <div className="oracle-arrow">→</div>
                        <div>
                          <span>Hidden/trusted final</span>
                          <strong>{selectedCandidate.trustedFinal?.passed ? 'PASS' : 'FAIL'}</strong>
                        </div>
                        <div className={`oracle-outcome ${outcomeTone(selectedCandidate.interventionOutcome)}`}>
                          {selectedCandidate.interventionOutcome || 'NO OUTCOME'}
                        </div>
                      </div>
                    )}

                    <div className="candidate-tabs">
                      <div className="candidate-code">
                        <div className="detail-label">Initial code</div>
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
                      <div className="candidate-code">
                        <div className="detail-label">
                          {selectedCandidate.repair?.attempted ? 'Final code after intervention' : 'Final code · unchanged'}
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
                  </>
                )}
              </div>
            )}

            <div className="suite-section">
              <div className="suite-section-head">
                <div>
                  <span className="lab-kicker">Verifier provenance</span>
                  <h3>Generated evidence suites</h3>
                </div>
                <span className="evidence-pill">Not ground truth</span>
              </div>
              <p>
                These suites drive controller decisions. Trusted tests, when supplied, are deliberately
                excluded from this evidence and are used only for retrospective harm/recovery accounting.
              </p>
              {(result.testSuites || []).map((suite) => (
                <details className="generated-tests" key={suite.id}>
                  <summary>
                    {suite.label} · {shortModel(suite.model)} · {suite.focus}
                  </summary>
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
                </details>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

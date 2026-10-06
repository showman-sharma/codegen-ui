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

function statusLabel(candidate) {
  const execution = candidate.execution || {};
  if (execution.configured === false) return 'Needs sandbox';
  if (execution.passed === true) return 'PASS';
  if (execution.passed === false) return 'FAIL';
  return 'Not run';
}

export default function LabView({ darkMode }) {
  const [prompt, setPrompt] = useState(STARTER);
  const [models, setModels] = useState([
    'qwen/qwen3-coder-30b-a3b-instruct',
    'deepseek/deepseek-v3.2',
  ]);
  const [strategies, setStrategies] = useState(['direct', 'plan']);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');

  const selectedCandidate = result?.candidates?.[selected] || null;
  const passes = useMemo(
    () => result?.candidates?.filter((c) => c.execution?.passed === true).length || 0,
    [result]
  );

  function toggleModel(id) {
    setModels((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id]
    );
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
        body: JSON.stringify({ prompt, models, strategies }),
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
    <main className="lab-workspace">
      <section className="lab-config">
        <div className="lab-kicker">Executable inference laboratory</div>
        <h1>Which inference strategy actually works?</h1>
        <p className="lab-lede">
          Run the same programming problem across models and strategies, then execute every
          candidate against one shared generated test suite in an isolated sandbox.
        </p>

        <div className="lab-section">
          <div className="lab-section-head">
            <span>01</span>
            <div>
              <strong>Problem</strong>
              <small>Python function tasks work best in this first version.</small>
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
              <strong>Models</strong>
              <small>Select up to four.</small>
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
              <strong>Inference strategies</strong>
              <small>Same model, different inference-time compute.</small>
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
              <span>Problem → structured plan → implementation</span>
              <small>2 generation calls</small>
            </button>
          </div>
        </div>

        <div className="lab-run-row">
          <div>
            <span className="lab-run-count">
              {models.length * strategies.length} candidate
              {models.length * strategies.length === 1 ? '' : 's'}
            </span>
            <small>All candidates receive the same generated tests.</small>
          </div>
          <button
            className="primary-btn lab-run"
            onClick={runExperiment}
            disabled={running || !prompt.trim() || models.length === 0 || strategies.length === 0}
          >
            {running ? 'Running experiment…' : 'Run experiment'}
          </button>
        </div>

        {error && <div className="lab-error">{error}</div>}
      </section>

      <section className="lab-results">
        {!result && !running && (
          <div className="lab-empty">
            <div className="lab-empty-mark">∑</div>
            <h2>Evidence, not vibes.</h2>
            <p>
              Configure an experiment on the left. CodeGen will generate candidates, create one
              shared test suite, execute each candidate in isolation, and expose failures.
            </p>
            <div className="evidence-note">
              Generated tests are diagnostic evidence — <strong>not ground truth</strong>.
            </div>
          </div>
        )}

        {running && (
          <div className="lab-empty">
            <span className="lab-big-spinner" />
            <h2>Running the matrix</h2>
            <p>Generating candidates, building shared tests, then executing each candidate.</p>
          </div>
        )}

        {result && (
          <div className="experiment-result">
            <div className="experiment-summary">
              <div>
                <span className="lab-kicker">Experiment result</span>
                <h2>{passes}/{result.candidates.length} candidates passed</h2>
              </div>
              <div className="evidence-pill">Generated-test evidence</div>
            </div>

            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Model</th>
                    <th>Strategy</th>
                    <th>Generation</th>
                    <th>Execution</th>
                    <th>Verdict</th>
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
                      <td>{(candidate.generationMs / 1000).toFixed(1)}s</td>
                      <td>
                        {candidate.execution?.durationMs
                          ? `${(candidate.execution.durationMs / 1000).toFixed(1)}s`
                          : '—'}
                      </td>
                      <td>
                        <span
                          className={`verdict ${statusLabel(candidate)
                            .toLowerCase()
                            .replace(' ', '-')}`}
                        >
                          {statusLabel(candidate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.candidates.some((c) => c.execution?.configured === false) && (
              <div className="sandbox-warning">
                <strong>Execution is not configured yet.</strong>
                <span>
                  Candidate generation worked, but the backend needs an E2B API key before CodeGen
                  can produce real PASS/FAIL execution evidence.
                </span>
              </div>
            )}

            <div className="candidate-detail">
              <div className="candidate-detail-head">
                <div>
                  <span className="lab-kicker">Candidate #{selected + 1}</span>
                  <h3>
                    {shortModel(selectedCandidate.model)} ·{' '}
                    {selectedCandidate.strategy === 'plan' ? 'Plan → Code' : 'Direct'}
                  </h3>
                </div>
                <span
                  className={`verdict ${statusLabel(selectedCandidate)
                    .toLowerCase()
                    .replace(' ', '-')}`}
                >
                  {statusLabel(selectedCandidate)}
                </span>
              </div>

              <div className="candidate-tabs">
                <div className="candidate-code">
                  <div className="detail-label">Generated code</div>
                  <AceEditor
                    mode="python"
                    theme={darkMode ? 'twilight' : 'textmate'}
                    value={selectedCandidate.code}
                    readOnly
                    width="100%"
                    height="330px"
                    setOptions={{ useWorker: false, showPrintMargin: false }}
                    fontSize={13}
                  />
                </div>

                <div className="candidate-evidence">
                  <div className="detail-label">Execution evidence</div>
                  <div className="evidence-card">
                    <div>
                      <span>Entry point</span>
                      <strong>{selectedCandidate.entryPoint || 'not detected'}</strong>
                    </div>
                    <div>
                      <span>Sandbox</span>
                      <strong>
                        {selectedCandidate.execution?.configured === false
                          ? 'not configured'
                          : 'isolated'}
                      </strong>
                    </div>
                    <div>
                      <span>Exit code</span>
                      <strong>{selectedCandidate.execution?.exitCode ?? '—'}</strong>
                    </div>
                  </div>
                  <pre className="execution-log">
                    {selectedCandidate.execution?.stderr ||
                      selectedCandidate.execution?.stdout ||
                      'No execution output.'}
                  </pre>
                  {selectedCandidate.plan && (
                    <>
                      <div className="detail-label plan-label">Plan used</div>
                      <div className="plan-preview">{selectedCandidate.plan}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <details className="generated-tests">
              <summary>Inspect shared generated tests</summary>
              <div className="generated-tests-note">
                These tests were generated once using {shortModel(result.testModel)} and applied to
                every candidate. Passing them does not establish semantic correctness.
              </div>
              <AceEditor
                mode="python"
                theme={darkMode ? 'twilight' : 'textmate'}
                value={result.tests}
                readOnly
                width="100%"
                height="260px"
                setOptions={{ useWorker: false, showPrintMargin: false }}
                fontSize={12}
              />
            </details>
          </div>
        )}
      </section>
    </main>
  );
}

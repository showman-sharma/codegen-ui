import React from 'react';

export default function HomeView({ onOpenLab, onOpenBuild }) {
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" />
            Evidence-aware code inference
          </div>

          <h1>
            Generate code.
            <br />
            <span>Trust the evidence first.</span>
          </h1>

          <p className="hero-lede">
            CodeGen Studio tests generated programs with independent verifiers before it allows
            repair. When the evidence conflicts, it gathers more evidence instead of blindly
            rewriting code.
          </p>

          <div className="hero-actions">
            <button className="hero-primary" onClick={onOpenLab}>
              Open the Lab
              <span>→</span>
            </button>
            <button className="hero-secondary" onClick={onOpenBuild}>
              Try Build mode
            </button>
          </div>

          <div className="hero-trust-row">
            <span>Isolated execution</span>
            <span>Bring your own models</span>
            <span>Keys are request-scoped</span>
            <span>Research-ready trajectories</span>
          </div>
        </div>

        <div className="hero-product-card" aria-label="Evidence-aware controller example">
          <div className="hero-card-top">
            <div>
              <span className="mini-label">Candidate trajectory</span>
              <strong>Qwen3 Coder · Direct</strong>
            </div>
            <span className="live-pill">Controller active</span>
          </div>

          <div className="hero-flow">
            <div className="hero-flow-node">
              <span className="flow-index">1</span>
              <div>
                <strong>Generate candidate</strong>
                <small>solution.py</small>
              </div>
              <span className="flow-status neutral">done</span>
            </div>

            <div className="flow-line" />

            <div className="hero-flow-node">
              <span className="flow-index">2</span>
              <div>
                <strong>Specification verifier</strong>
                <small>Independent generated tests</small>
              </div>
              <span className="flow-status fail">FAIL</span>
            </div>

            <div className="flow-line" />

            <div className="hero-flow-node">
              <span className="flow-index">3</span>
              <div>
                <strong>Boundary verifier</strong>
                <small>Different evidence source</small>
              </div>
              <span className="flow-status pass">PASS</span>
            </div>

            <div className="flow-line accent-line" />

            <div className="controller-callout">
              <div className="controller-symbol">◇</div>
              <div>
                <span className="mini-label">Controller decision</span>
                <strong>Do not repair yet.</strong>
                <p>The verifiers disagree. Acquire more evidence before modifying the program.</p>
              </div>
            </div>
          </div>

          <div className="hero-card-footer">
            <span>Repair is gated by corroborated evidence</span>
            <span className="footer-check">✓</span>
          </div>
        </div>
      </section>

      <section className="home-value-strip">
        <div>
          <strong>01</strong>
          <span>Generate</span>
          <p>Compare models and inference strategies on the same coding problem.</p>
        </div>
        <div>
          <strong>02</strong>
          <span>Verify</span>
          <p>Use independent executable evidence instead of a single self-test signal.</p>
        </div>
        <div>
          <strong>03</strong>
          <span>Decide</span>
          <p>Accept, verify more, repair, or stop based on evidence agreement.</p>
        </div>
        <div>
          <strong>04</strong>
          <span>Measure</span>
          <p>With trusted tests, label interventions as recovery, harm, safe, or wasted.</p>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <span className="hero-eyebrow">Why CodeGen exists</span>
          <h2>More inference is not automatically better.</h2>
          <p>
            A coding model can generate bad tests, misread a failure, and “repair” correct code into
            something worse. CodeGen makes the verifier itself part of the experiment.
          </p>
        </div>

        <div className="problem-grid">
          <article>
            <div className="problem-icon">×</div>
            <h3>Naive repair loop</h3>
            <div className="mini-flow">
              <span>Generated test fails</span><b>→</b><span>Repair immediately</span><b>→</b><span className="danger-text">Possible harm</span>
            </div>
            <p>A single fallible verifier is treated like ground truth.</p>
          </article>

          <article className="featured-problem-card">
            <div className="problem-icon">◇</div>
            <h3>Evidence-aware control</h3>
            <div className="mini-flow">
              <span>Verify independently</span><b>→</b><span>Check agreement</span><b>→</b><span className="success-text">Intervene only when justified</span>
            </div>
            <p>Compute is spent on either better code or better evidence, depending on uncertainty.</p>
          </article>
        </div>
      </section>

      <section className="home-section workflow-section">
        <div className="section-heading">
          <span className="hero-eyebrow">One experiment, end to end</span>
          <h2>Designed to be useful in five minutes.</h2>
        </div>

        <div className="workflow-grid">
          <div className="workflow-step">
            <span>1</span>
            <h3>Paste a problem</h3>
            <p>Start with a Python function task. A strong example is preloaded.</p>
          </div>
          <div className="workflow-step">
            <span>2</span>
            <h3>Choose models</h3>
            <p>Use managed demo models or bring your own OpenRouter/OpenAI credentials.</p>
          </div>
          <div className="workflow-step">
            <span>3</span>
            <h3>Run the controller</h3>
            <p>CodeGen generates candidates, verifies twice, and escalates only when needed.</p>
          </div>
          <div className="workflow-step">
            <span>4</span>
            <h3>Inspect the trajectory</h3>
            <p>See exactly why CodeGen accepted, repaired, verified more, or stopped.</p>
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div>
          <span className="hero-eyebrow">Research preview</span>
          <h2>See whether repair helped — not whether it merely looked convincing.</h2>
          <p>
            Add trusted tests in Research mode to measure recovery and harmful intervention without
            leaking the oracle to the controller.
          </p>
        </div>
        <button className="hero-primary" onClick={onOpenLab}>
          Run an experiment
          <span>→</span>
        </button>
      </section>

      <footer className="site-footer">
        <span>CodeGen Studio · evidence-aware code inference</span>
        <a href="https://github.com/showman-sharma/codegen-ui" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </main>
  );
}

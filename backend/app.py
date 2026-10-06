# backend/app.py
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
from e2b import Sandbox

from prompters import (
    PHP_Enhancer,
    add_comments_to_code,
    explain_code,
    generate_SCoT,
    generate_one_completion_SCoT,
    generate_one_completion_basic,
    generate_test_cases,
    extract_main_function,
    refine_code,
    repair_from_evidence,
    suggest_refinement,
)

load_dotenv()
app = Flask(__name__)
CORS(app)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_client(model: str) -> OpenAI:
    """Use OpenRouter for provider/model slugs and OpenAI for legacy OpenAI model IDs."""
    if "/" in model:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OPENROUTER_API_KEY is required for OpenRouter models. "
                "Add it to backend/.env or your deployment environment."
            )
        return OpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            timeout=45.0,
            max_retries=1,
            default_headers={
                "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://codegen-ui-xi.vercel.app"),
                "X-Title": os.getenv("OPENROUTER_APP_NAME", "CodeGen UI"),
            },
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for direct OpenAI models.")
    return OpenAI(api_key=api_key, timeout=45.0, max_retries=1)


def request_model(data: dict) -> str:
    return data.get("model", "qwen/qwen3-coder-30b-a3b-instruct")


@app.errorhandler(Exception)
def handle_error(error):
    app.logger.exception(error)
    return jsonify({"error": str(error)}), 500


@app.route("/api/generate-scot", methods=["POST"])
def api_generate_scot():
    data = request.json or {}
    prompt = data.get("prompt", "")
    model = request_model(data)
    scot = generate_SCoT(get_client(model), prompt, model)
    return jsonify({"scot": scot})


@app.route("/api/generate-code", methods=["POST"])
def api_generate_code():
    data = request.json or {}
    prompt = data.get("prompt", "")
    num_samples = data.get("numSamples", 1)
    scot = data.get("scot")
    model = request_model(data)
    code = data.get("code", "")
    client = get_client(model)

    if scot:
        code = generate_one_completion_SCoT(client, prompt, model, scot=scot)
    else:
        code = generate_one_completion_basic(client, prompt, num_samples, model, code)
    return jsonify({"code": code})


@app.route("/api/suggest-refine", methods=["POST"])
def api_suggest_refine():
    data = request.json or {}
    code = data.get("code", "")
    prompt = data.get("prompt", "")
    model = request_model(data)
    suggestion = suggest_refinement(get_client(model), code, prompt, model=model)
    return jsonify({"suggestion": suggestion})


@app.route("/api/refine-code", methods=["POST"])
def api_refine_code():
    data = request.json or {}
    code = data.get("code", "")
    suggestion = data.get("suggestion", "")
    model = request_model(data)
    refined = refine_code(get_client(model), code, suggestion, model=model)
    return jsonify({"refinedCode": refined})


@app.route("/api/auto-enhance", methods=["POST"])
def api_auto_enhance():
    data = request.json or {}
    code = data.get("code", "")
    prompt = data.get("prompt", "")
    model = request_model(data)
    enhanced = PHP_Enhancer(
        get_client(model), code, prompt, max_iterations=1, model=model
    )
    return jsonify({"enhancedCode": enhanced})


@app.route("/api/explain-code", methods=["POST"])
def api_explain_code():
    data = request.json or {}
    code = data.get("code", "")
    model = request_model(data)
    explanation = explain_code(get_client(model), code, model=model)
    return jsonify({"explanation": explanation})


@app.route("/api/comment-code", methods=["POST"])
def api_comment_code():
    data = request.json or {}
    code = data.get("code", "")
    model = request_model(data)
    commented = add_comments_to_code(get_client(model), code, model=model)
    return jsonify({"commentedCode": commented})


@app.route("/api/generate-tests", methods=["POST"])
def api_generate_tests():
    data = request.json or {}
    prompt = data.get("prompt", "")
    code = data.get("code", "")
    model = request_model(data)
    main_fn = data.get("mainFn")

    _, test_code = generate_test_cases(
        get_client(model), prompt, code, model=model, main_fn=main_fn
    )
    return jsonify({"testCases": test_code})


def execute_in_sandbox(code: str, tests: str, entry_point: str, timeout_seconds: int = 8) -> dict:
    """Execute model-generated Python and generated tests in an isolated E2B microVM."""
    if not os.getenv("E2B_API_KEY"):
        return {
            "configured": False,
            "passed": None,
            "error": "E2B_API_KEY is not configured on the backend.",
        }

    if not code.strip() or not tests.strip() or not entry_point:
        raise ValueError("Code, tests, and a detected entry point are required.")

    runner = f"""
{code}

{tests}

if __name__ == "__main__":
    check({entry_point})
    print("__CODEGEN_RESULT__:PASS")
"""
    payload = base64.b64encode(runner.encode("utf-8")).decode("ascii")
    command = (
        "python -I -c \"import base64;"
        "exec(compile(base64.b64decode('"
        + payload
        + "'), '<codegen-lab>', 'exec'))\""
    )

    started = time.perf_counter()
    sandbox = Sandbox.create(timeout=max(timeout_seconds + 5, 15))
    try:
        result = sandbox.commands.run(command, timeout=timeout_seconds)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        stdout = getattr(result, "stdout", "") or ""
        stderr = getattr(result, "stderr", "") or ""
        exit_code = getattr(result, "exit_code", None)
        output = getattr(result, "output", "") or ""
        if output and not stdout:
            stdout = output

        passed = "__CODEGEN_RESULT__:PASS" in stdout and (exit_code in (0, None))
        return {
            "configured": True,
            "passed": passed,
            "stdout": stdout[-12000:],
            "stderr": stderr[-12000:],
            "exitCode": exit_code,
            "durationMs": elapsed_ms,
            "entryPoint": entry_point,
        }
    except Exception as exc:
        return {
            "configured": True,
            "passed": False,
            "stdout": "",
            "stderr": str(exc),
            "exitCode": None,
            "durationMs": round((time.perf_counter() - started) * 1000),
            "entryPoint": entry_point,
        }
    finally:
        try:
            sandbox.kill()
        except Exception:
            pass


@app.route("/api/run-tests", methods=["POST"])
def api_run_tests():
    data = request.json or {}
    code = data.get("code", "")
    tests = data.get("tests", "")
    entry_point = data.get("entryPoint") or extract_main_function(code)
    result = execute_in_sandbox(code, tests, entry_point)
    return jsonify(result)


@app.route("/api/lab/run", methods=["POST"])
def api_lab_run():
    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    models = data.get("models") or ["qwen/qwen3-coder-30b-a3b-instruct"]
    strategies = data.get("strategies") or ["direct"]
    trusted_tests = data.get("trustedTests", "").strip()

    if not prompt:
        raise ValueError("A problem prompt is required.")
    if len(models) > 4:
        raise ValueError("Lab currently supports at most 4 models per experiment.")
    if len(strategies) > 3:
        raise ValueError("Lab currently supports at most 3 strategies per experiment.")

    allowed_strategies = {"direct", "plan"}
    unknown = [s for s in strategies if s not in allowed_strategies]
    if unknown:
        raise ValueError(f"Unsupported strategies: {', '.join(unknown)}")

    def build_candidate(model, strategy):
        started = time.perf_counter()
        plan = None
        try:
            client = get_client(model)
            if strategy == "plan":
                plan = generate_SCoT(client, prompt, model)
                code = generate_one_completion_SCoT(client, prompt, model, scot=plan)
            else:
                code = generate_one_completion_basic(client, prompt, 1, model, "")
            return {
                "model": model,
                "strategy": strategy,
                "code": code,
                "plan": plan,
                "generationMs": round((time.perf_counter() - started) * 1000),
                "entryPoint": extract_main_function(code),
                "generationError": None,
            }
        except Exception as exc:
            return {
                "model": model,
                "strategy": strategy,
                "code": "",
                "plan": plan,
                "generationMs": round((time.perf_counter() - started) * 1000),
                "entryPoint": None,
                "generationError": str(exc),
                "controller": {
                    "action": "GENERATION_FAILED",
                    "reason": str(exc),
                    "verifierTrust": "unavailable",
                },
            }

    jobs = [(model, strategy) for model in models for strategy in strategies]
    candidates = []
    with ThreadPoolExecutor(max_workers=min(len(jobs), 8)) as pool:
        future_map = {
            pool.submit(build_candidate, model, strategy): (model, strategy)
            for model, strategy in jobs
        }
        for future in as_completed(future_map):
            candidates.append(future.result())

    order = {pair: i for i, pair in enumerate(jobs)}
    candidates.sort(key=lambda item: order[(item["model"], item["strategy"])])

    valid_candidates = [
        c for c in candidates if c.get("code") and not c.get("generationError")
    ]
    if not valid_candidates:
        return jsonify({
            "prompt": prompt,
            "evidenceType": "multi-verifier-generated-tests",
            "testSuites": [],
            "candidates": candidates,
            "error": "All candidate generations failed.",
        })

    seed_candidate = next(
        (c for c in valid_candidates if c.get("entryPoint")), valid_candidates[0]
    )
    entry_point = seed_candidate.get("entryPoint") or extract_main_function(seed_candidate["code"])

    verifier_models = [models[0], models[1] if len(models) > 1 else models[0]]
    suite_specs = [
        ("spec", "Specification verifier", verifier_models[0], "specification"),
        ("edge", "Boundary verifier", verifier_models[1], "adversarial"),
    ]

    def build_suite(spec):
        suite_id, label, model, focus = spec
        client = get_client(model)
        _, tests = generate_test_cases(
            client,
            prompt,
            seed_candidate["code"],
            model=model,
            main_fn=entry_point,
            focus=focus,
        )
        return {
            "id": suite_id,
            "label": label,
            "model": model,
            "focus": focus,
            "tests": tests,
        }

    test_suites = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(build_suite, spec) for spec in suite_specs]
        for future in as_completed(futures):
            test_suites.append(future.result())
    suite_order = {"spec": 0, "edge": 1}
    test_suites.sort(key=lambda suite: suite_order[suite["id"]])

    def run_suite(candidate, suite, code_override=None):
        code = code_override if code_override is not None else candidate["code"]
        candidate_entry = extract_main_function(code) or candidate.get("entryPoint") or entry_point
        execution = execute_in_sandbox(code, suite["tests"], candidate_entry)
        return {
            "suiteId": suite["id"],
            "suiteLabel": suite["label"],
            "model": suite["model"],
            "passed": execution.get("passed"),
            "durationMs": execution.get("durationMs"),
            "stdout": execution.get("stdout", ""),
            "stderr": execution.get("stderr", ""),
            "exitCode": execution.get("exitCode"),
        }

    def run_trusted(candidate, code_override=None):
        if not trusted_tests:
            return None
        code = code_override if code_override is not None else candidate["code"]
        candidate_entry = extract_main_function(code) or candidate.get("entryPoint") or entry_point
        return execute_in_sandbox(code, trusted_tests, candidate_entry)

    # Initial evidence is collected from two independently prompted/generated suites.
    evidence_jobs = []
    with ThreadPoolExecutor(max_workers=min(len(valid_candidates) * len(test_suites), 8)) as pool:
        future_map = {}
        for candidate in valid_candidates:
            candidate["initialEvidence"] = []
            for suite in test_suites:
                future = pool.submit(run_suite, candidate, suite)
                future_map[future] = candidate
        for future in as_completed(future_map):
            future_map[future]["initialEvidence"].append(future.result())

    for candidate in valid_candidates:
        candidate["initialEvidence"].sort(
            key=lambda ev: suite_order.get(ev["suiteId"], 99)
        )

    # Trusted tests are evaluation-only: results are recorded but never used by the controller.
    if trusted_tests:
        with ThreadPoolExecutor(max_workers=min(len(valid_candidates), 4)) as pool:
            future_map = {
                pool.submit(run_trusted, candidate): candidate
                for candidate in valid_candidates
            }
            for future in as_completed(future_map):
                future_map[future]["trustedInitial"] = future.result()

    disagreements = []
    repair_targets = []
    for candidate in valid_candidates:
        verdicts = [ev.get("passed") for ev in candidate["initialEvidence"]]
        if verdicts == [True, True]:
            candidate["controller"] = {
                "action": "ACCEPT_PROVISIONALLY",
                "reason": "Both independent generated verifiers passed.",
                "verifierTrust": "corroborated-pass",
                "evidenceCalls": 2,
            }
        elif verdicts == [False, False]:
            candidate["controller"] = {
                "action": "REPAIR",
                "reason": "Both independent generated verifiers found a failure.",
                "verifierTrust": "corroborated-failure",
                "evidenceCalls": 2,
            }
            repair_targets.append(candidate)
        else:
            candidate["controller"] = {
                "action": "ACQUIRE_MORE_EVIDENCE",
                "reason": "Generated verifiers disagree; do not repair yet.",
                "verifierTrust": "conflicted",
                "evidenceCalls": 2,
            }
            disagreements.append(candidate)

    # Evidence escalation: only pay for a third verifier when the first two disagree.
    if disagreements:
        tie_model = models[2] if len(models) > 2 else models[0]
        tie_spec = ("tie", "Tie-break verifier", tie_model, "discriminating")
        tie_suite = build_suite(tie_spec)
        test_suites.append(tie_suite)

        with ThreadPoolExecutor(max_workers=min(len(disagreements), 4)) as pool:
            future_map = {
                pool.submit(run_suite, candidate, tie_suite): candidate
                for candidate in disagreements
            }
            for future in as_completed(future_map):
                candidate = future_map[future]
                tie_evidence = future.result()
                candidate["initialEvidence"].append(tie_evidence)
                passed_count = sum(
                    ev.get("passed") is True for ev in candidate["initialEvidence"]
                )
                failed_count = sum(
                    ev.get("passed") is False for ev in candidate["initialEvidence"]
                )
                if failed_count > passed_count:
                    candidate["controller"] = {
                        "action": "REPAIR",
                        "reason": "A third verifier resolved the disagreement toward failure.",
                        "verifierTrust": "majority-failure",
                        "evidenceCalls": 3,
                    }
                    repair_targets.append(candidate)
                else:
                    candidate["controller"] = {
                        "action": "ACCEPT_PROVISIONALLY",
                        "reason": "A third verifier resolved the disagreement toward pass.",
                        "verifierTrust": "majority-pass",
                        "evidenceCalls": 3,
                    }

    # Only corroborated/majority failures are allowed to trigger code modification.
    def repair_candidate(candidate):
        relevant_suites = [
            suite for suite in test_suites
            if any(ev["suiteId"] == suite["id"] for ev in candidate["initialEvidence"])
        ]
        evidence_lines = []
        for ev in candidate["initialEvidence"]:
            status = "PASS" if ev.get("passed") else "FAIL"
            diagnostic = (ev.get("stderr") or ev.get("stdout") or "").strip()
            if diagnostic:
                diagnostic = diagnostic[-1800:]
            evidence_lines.append(
                f'{ev["suiteLabel"]}: {status}\n{diagnostic}'
            )
        evidence_summary = "\n\n".join(evidence_lines)

        started = time.perf_counter()
        try:
            repaired_code = repair_from_evidence(
                get_client(candidate["model"]),
                prompt,
                candidate["code"],
                evidence_summary,
                model=candidate["model"],
            )
            repair_ms = round((time.perf_counter() - started) * 1000)
            repaired_evidence = []
            with ThreadPoolExecutor(max_workers=min(len(relevant_suites), 3)) as pool:
                futures = [
                    pool.submit(run_suite, candidate, suite, repaired_code)
                    for suite in relevant_suites
                ]
                for future in as_completed(futures):
                    repaired_evidence.append(future.result())
            repaired_evidence.sort(
                key=lambda ev: {"spec": 0, "edge": 1, "tie": 2}.get(ev["suiteId"], 99)
            )

            candidate["repair"] = {
                "attempted": True,
                "code": repaired_code,
                "generationMs": repair_ms,
                "evidence": repaired_evidence,
            }
        except Exception as exc:
            candidate["repair"] = {
                "attempted": True,
                "error": str(exc),
                "code": candidate["code"],
                "generationMs": round((time.perf_counter() - started) * 1000),
                "evidence": candidate["initialEvidence"],
            }
        return candidate

    if repair_targets:
        with ThreadPoolExecutor(max_workers=min(len(repair_targets), 4)) as pool:
            futures = [pool.submit(repair_candidate, candidate) for candidate in repair_targets]
            for future in as_completed(futures):
                future.result()

    # Evaluate final code on trusted tests only after the controller has finished.
    if trusted_tests:
        with ThreadPoolExecutor(max_workers=min(len(valid_candidates), 4)) as pool:
            future_map = {}
            for candidate in valid_candidates:
                final_code = candidate.get("repair", {}).get("code") or candidate["code"]
                future = pool.submit(run_trusted, candidate, final_code)
                future_map[future] = candidate
            for future in as_completed(future_map):
                candidate = future_map[future]
                candidate["trustedFinal"] = future.result()

                initial_pass = candidate.get("trustedInitial", {}).get("passed")
                final_pass = candidate.get("trustedFinal", {}).get("passed")
                intervened = bool(candidate.get("repair", {}).get("attempted"))

                if not intervened:
                    outcome = "NO_INTERVENTION"
                elif initial_pass is False and final_pass is True:
                    outcome = "RECOVERY"
                elif initial_pass is True and final_pass is False:
                    outcome = "HARM"
                elif initial_pass is True and final_pass is True:
                    outcome = "SAFE"
                elif initial_pass is False and final_pass is False:
                    outcome = "WASTED"
                else:
                    outcome = "UNKNOWN"
                candidate["interventionOutcome"] = outcome

    for candidate in valid_candidates:
        if candidate.get("repair"):
            final_evidence = candidate["repair"].get("evidence", [])
            passes = sum(ev.get("passed") is True for ev in final_evidence)
            failures = sum(ev.get("passed") is False for ev in final_evidence)
            candidate["finalDecision"] = (
                "ACCEPT_AFTER_REPAIR" if passes > failures else "STOP_UNRESOLVED"
            )
        else:
            candidate["finalDecision"] = candidate.get("controller", {}).get(
                "action", "UNKNOWN"
            )

    summary = {
        "acceptedWithoutRepair": sum(
            c.get("controller", {}).get("action") == "ACCEPT_PROVISIONALLY"
            for c in valid_candidates
        ),
        "repairsAttempted": sum(
            bool(c.get("repair", {}).get("attempted")) for c in valid_candidates
        ),
        "evidenceEscalations": len(disagreements),
        "recoveries": sum(
            c.get("interventionOutcome") == "RECOVERY" for c in valid_candidates
        ),
        "harms": sum(
            c.get("interventionOutcome") == "HARM" for c in valid_candidates
        ),
    }

    return jsonify({
        "prompt": prompt,
        "evidenceType": "multi-verifier-generated-tests",
        "controllerPolicy": "verify-twice-escalate-on-disagreement-repair-on-corroborated-failure",
        "trustedTestsProvided": bool(trusted_tests),
        "testSuites": test_suites,
        "summary": summary,
        "candidates": candidates,
    })


if __name__ == "__main__":
    check({entry_point})
    print("__CODEGEN_RESULT__:PASS")
"""
    payload = base64.b64encode(runner.encode("utf-8")).decode("ascii")
    command = (
        "python -I -c \"import base64;"
        "exec(compile(base64.b64decode('"
        + payload
        + "'), '<codegen-lab>', 'exec'))\""
    )

    started = time.perf_counter()
    sandbox = Sandbox.create(timeout=max(timeout_seconds + 5, 15))
    try:
        result = sandbox.commands.run(command, timeout=timeout_seconds)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        stdout = getattr(result, "stdout", "") or ""
        stderr = getattr(result, "stderr", "") or ""
        exit_code = getattr(result, "exit_code", None)
        output = getattr(result, "output", "") or ""
        if output and not stdout:
            stdout = output

        passed = "__CODEGEN_RESULT__:PASS" in stdout and (exit_code in (0, None))
        return {
            "configured": True,
            "passed": passed,
            "stdout": stdout[-12000:],
            "stderr": stderr[-12000:],
            "exitCode": exit_code,
            "durationMs": elapsed_ms,
            "entryPoint": entry_point,
        }
    except Exception as exc:
        return {
            "configured": True,
            "passed": False,
            "stdout": "",
            "stderr": str(exc),
            "exitCode": None,
            "durationMs": round((time.perf_counter() - started) * 1000),
            "entryPoint": entry_point,
        }
    finally:
        try:
            sandbox.kill()
        except Exception:
            pass


@app.route("/api/run-tests", methods=["POST"])
def api_run_tests():
    data = request.json or {}
    code = data.get("code", "")
    tests = data.get("tests", "")
    entry_point = data.get("entryPoint") or extract_main_function(code)
    result = execute_in_sandbox(code, tests, entry_point)
    return jsonify(result)


@app.route("/api/lab/run", methods=["POST"])
def api_lab_run():
    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    models = data.get("models") or ["qwen/qwen3-coder-30b-a3b-instruct"]
    strategies = data.get("strategies") or ["direct"]

    if not prompt:
        raise ValueError("A problem prompt is required.")
    if len(models) > 4:
        raise ValueError("Lab currently supports at most 4 models per experiment.")
    if len(strategies) > 3:
        raise ValueError("Lab currently supports at most 3 strategies per experiment.")

    allowed_strategies = {"direct", "plan"}
    unknown = [s for s in strategies if s not in allowed_strategies]
    if unknown:
        raise ValueError(f"Unsupported strategies: {', '.join(unknown)}")

    def build_candidate(model, strategy):
        started = time.perf_counter()
        plan = None
        try:
            client = get_client(model)
            if strategy == "plan":
                plan = generate_SCoT(client, prompt, model)
                code = generate_one_completion_SCoT(client, prompt, model, scot=plan)
            else:
                code = generate_one_completion_basic(client, prompt, 1, model, "")
            return {
                "model": model,
                "strategy": strategy,
                "code": code,
                "plan": plan,
                "generationMs": round((time.perf_counter() - started) * 1000),
                "entryPoint": extract_main_function(code),
                "generationError": None,
            }
        except Exception as exc:
            return {
                "model": model,
                "strategy": strategy,
                "code": "",
                "plan": plan,
                "generationMs": round((time.perf_counter() - started) * 1000),
                "entryPoint": None,
                "generationError": str(exc),
                "execution": {
                    "configured": bool(os.getenv("E2B_API_KEY")),
                    "passed": None,
                    "error": "Not executed because generation failed.",
                },
            }

    jobs = [(model, strategy) for model in models for strategy in strategies]
    candidates = []
    with ThreadPoolExecutor(max_workers=min(len(jobs), 8)) as pool:
        future_map = {
            pool.submit(build_candidate, model, strategy): (model, strategy)
            for model, strategy in jobs
        }
        for future in as_completed(future_map):
            candidates.append(future.result())

    order = {pair: i for i, pair in enumerate(jobs)}
    candidates.sort(key=lambda item: order[(item["model"], item["strategy"])])

    # One shared generated test suite gives every candidate the same evidence.
    # It is deliberately reported as generated evidence, not ground truth.
    test_model = data.get("testModel") or models[0]
    test_client = get_client(test_model)
    valid_candidates = [c for c in candidates if c.get("code") and not c.get("generationError")]
    if not valid_candidates:
        return jsonify({
            "prompt": prompt,
            "testModel": test_model,
            "tests": "",
            "evidenceType": "generated-tests",
            "candidates": candidates,
            "error": "All candidate generations failed.",
        })

    seed_candidate = next((c for c in valid_candidates if c.get("entryPoint")), valid_candidates[0])
    entry_point, tests = generate_test_cases(
        test_client,
        prompt,
        seed_candidate["code"],
        model=test_model,
        main_fn=seed_candidate.get("entryPoint"),
    )

    def execute_candidate(candidate):
        if candidate.get("generationError"):
            return candidate
        candidate_entry = candidate.get("entryPoint") or entry_point
        candidate["execution"] = execute_in_sandbox(
            candidate["code"], tests, candidate_entry
        )
        return candidate

    executable = [c for c in candidates if not c.get("generationError")]
    if executable:
        with ThreadPoolExecutor(max_workers=min(len(executable), 4)) as pool:
            futures = [pool.submit(execute_candidate, candidate) for candidate in executable]
            for future in as_completed(futures):
                future.result()

    return jsonify({
        "prompt": prompt,
        "testModel": test_model,
        "tests": tests,
        "evidenceType": "generated-tests",
        "candidates": candidates,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

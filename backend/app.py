# backend/app.py
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import time

from dotenv import load_dotenv
from e2b import Sandbox
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI

from prompters import (
    PHP_Enhancer,
    add_comments_to_code,
    explain_code,
    extract_main_function,
    generate_SCoT,
    generate_one_completion_SCoT,
    generate_one_completion_basic,
    generate_test_cases,
    refine_code,
    repair_from_evidence,
    suggest_refinement,
)

load_dotenv()
app = Flask(__name__)
CORS(app)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_client(model: str, provider_config: dict | None = None) -> OpenAI:
    """Create a request-scoped model client. BYOK credentials are never persisted."""
    provider_config = provider_config or {}
    provider = provider_config.get("provider", "server")
    supplied_key = provider_config.get("apiKey")

    if provider == "openrouter":
        api_key = supplied_key or os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("An OpenRouter API key is required for this model.")
        return OpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            timeout=45.0,
            max_retries=1,
            default_headers={
                "HTTP-Referer": os.getenv(
                    "OPENROUTER_SITE_URL", "https://codegen-ui-xi.vercel.app"
                ),
                "X-Title": os.getenv("OPENROUTER_APP_NAME", "CodeGen Studio"),
            },
        )

    if provider == "openai":
        api_key = supplied_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("An OpenAI API key is required for this model.")
        return OpenAI(api_key=api_key, timeout=45.0, max_retries=1)

    if provider != "server":
        raise ValueError(
            "Unsupported provider. Public BYOK currently supports OpenRouter and OpenAI."
        )

    if "/" in model:
        return get_client(
            model,
            {"provider": "openrouter", "apiKey": os.getenv("OPENROUTER_API_KEY")},
        )
    return get_client(
        model,
        {"provider": "openai", "apiKey": os.getenv("OPENAI_API_KEY")},
    )


def request_model(data: dict) -> str:
    return data.get("model", "qwen/qwen3-coder-30b-a3b-instruct")


def normalize_model_configs(data: dict) -> list[dict]:
    """Normalize managed and BYOK Lab models while keeping secrets request-local."""
    raw_configs = data.get("modelConfigs")

    if not raw_configs:
        models = data.get("models") or ["qwen/qwen3-coder-30b-a3b-instruct"]
        raw_configs = [
            {
                "key": f"managed-{index}",
                "provider": "server",
                "model": model,
                "label": model,
            }
            for index, model in enumerate(models)
        ]

    if not isinstance(raw_configs, list):
        raise ValueError("modelConfigs must be a list.")
    if not 1 <= len(raw_configs) <= 4:
        raise ValueError("Choose between 1 and 4 models.")

    normalized = []
    seen_keys = set()
    for index, raw in enumerate(raw_configs):
        provider = str(raw.get("provider", "server")).strip().lower()
        model = str(raw.get("model", "")).strip()
        label = str(raw.get("label") or model).strip()
        api_key = raw.get("apiKey")
        config_key = str(raw.get("key") or f"model-{index}")

        if provider not in {"server", "openrouter", "openai"}:
            raise ValueError("Provider must be managed, OpenRouter, or OpenAI.")
        if not model:
            raise ValueError("Every model configuration needs a model ID.")
        if provider in {"openrouter", "openai"} and not api_key:
            raise ValueError(f"{label} is missing its {provider} API key.")
        if config_key in seen_keys:
            config_key = f"{config_key}-{index}"
        seen_keys.add(config_key)

        normalized.append(
            {
                "key": config_key,
                "provider": provider,
                "model": model,
                "label": label,
                "apiKey": api_key,
            }
        )

    return normalized


def public_model_config(config: dict) -> dict:
    """Return model metadata with credentials stripped."""
    return {
        "key": config["key"],
        "provider": config["provider"],
        "model": config["model"],
        "label": config["label"],
    }


@app.errorhandler(Exception)
def handle_error(error):
    app.logger.exception(error)
    return jsonify({"error": str(error)}), 500


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify(
        {
            "ok": True,
            "openrouterConfigured": bool(os.getenv("OPENROUTER_API_KEY")),
            "openaiConfigured": bool(os.getenv("OPENAI_API_KEY")),
            "sandboxConfigured": bool(os.getenv("E2B_API_KEY")),
        }
    )


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


def execute_in_sandbox(
    code: str, tests: str, entry_point: str, timeout_seconds: int = 8
) -> dict:
    """Execute generated Python and a check(func) suite in an isolated E2B sandbox."""
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

        passed = "__CODEGEN_RESULT__:PASS" in stdout and exit_code in (0, None)
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
    return jsonify(execute_in_sandbox(code, tests, entry_point))


@app.route("/api/lab/run", methods=["POST"])
def api_lab_run():
    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    model_configs = normalize_model_configs(data)
    strategies = data.get("strategies") or ["direct"]
    trusted_tests = data.get("trustedTests", "").strip()

    if not prompt:
        raise ValueError("A problem prompt is required.")
    if not 1 <= len(strategies) <= 2:
        raise ValueError("Choose Direct, Plan → Code, or both.")

    allowed_strategies = {"direct", "plan"}
    unknown = [strategy for strategy in strategies if strategy not in allowed_strategies]
    if unknown:
        raise ValueError(f"Unsupported strategies: {', '.join(unknown)}")

    config_by_key = {config["key"]: config for config in model_configs}

    def build_candidate(config, strategy):
        started = time.perf_counter()
        plan = None
        model = config["model"]
        try:
            client = get_client(model, config)
            if strategy == "plan":
                plan = generate_SCoT(client, prompt, model)
                code = generate_one_completion_SCoT(
                    client, prompt, model, scot=plan
                )
            else:
                code = generate_one_completion_basic(
                    client, prompt, 1, model, ""
                )
            return {
                **public_model_config(config),
                "strategy": strategy,
                "code": code,
                "plan": plan,
                "generationMs": round((time.perf_counter() - started) * 1000),
                "entryPoint": extract_main_function(code),
                "generationError": None,
            }
        except Exception as exc:
            return {
                **public_model_config(config),
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
                    "evidenceCalls": 0,
                },
                "finalDecision": "GENERATION_FAILED",
            }

    jobs = [
        (config["key"], strategy)
        for config in model_configs
        for strategy in strategies
    ]
    candidates = []

    with ThreadPoolExecutor(max_workers=min(len(jobs), 8)) as pool:
        future_map = {
            pool.submit(build_candidate, config, strategy): (
                config["key"],
                strategy,
            )
            for config in model_configs
            for strategy in strategies
        }
        for future in as_completed(future_map):
            candidates.append(future.result())

    order = {pair: index for index, pair in enumerate(jobs)}
    candidates.sort(
        key=lambda item: order[(item["key"], item["strategy"])]
    )

    valid_candidates = [
        candidate
        for candidate in candidates
        if candidate.get("code") and not candidate.get("generationError")
    ]

    if not valid_candidates:
        return jsonify(
            {
                "prompt": prompt,
                "evidenceType": "multi-verifier-generated-tests",
                "controllerPolicy": "evidence-aware-v1",
                "trustedTestsProvided": bool(trusted_tests),
                "testSuites": [],
                "summary": {
                    "acceptedWithoutRepair": 0,
                    "evidenceEscalations": 0,
                    "repairsAttempted": 0,
                    "recoveries": 0,
                    "harms": 0,
                },
                "candidates": candidates,
                "warning": "All candidate generations failed.",
            }
        )

    seed_candidate = next(
        (
            candidate
            for candidate in valid_candidates
            if candidate.get("entryPoint")
        ),
        valid_candidates[0],
    )
    seed_entry = seed_candidate.get("entryPoint") or extract_main_function(
        seed_candidate["code"]
    )

    verifier_configs = [
        model_configs[0],
        model_configs[1] if len(model_configs) > 1 else model_configs[0],
    ]
    verifier_specs = [
        (
            "spec",
            "Specification verifier",
            verifier_configs[0],
            "specification",
        ),
        (
            "edge",
            "Boundary verifier",
            verifier_configs[1],
            "adversarial",
        ),
    ]

    def build_suite(spec):
        suite_id, label, config, focus = spec
        started = time.perf_counter()
        try:
            _, tests = generate_test_cases(
                get_client(config["model"], config),
                prompt,
                seed_candidate["code"],
                model=config["model"],
                main_fn=seed_entry,
                focus=focus,
            )
            return {
                "id": suite_id,
                "label": label,
                **public_model_config(config),
                "focus": focus,
                "tests": tests,
                "generationMs": round(
                    (time.perf_counter() - started) * 1000
                ),
                "available": True,
                "error": None,
            }
        except Exception as exc:
            return {
                "id": suite_id,
                "label": label,
                **public_model_config(config),
                "focus": focus,
                "tests": "",
                "generationMs": round(
                    (time.perf_counter() - started) * 1000
                ),
                "available": False,
                "error": str(exc),
            }

    test_suites = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(build_suite, spec) for spec in verifier_specs
        ]
        for future in as_completed(futures):
            test_suites.append(future.result())

    suite_order = {"spec": 0, "edge": 1, "tie": 2}
    test_suites.sort(
        key=lambda suite: suite_order.get(suite["id"], 99)
    )
    available_suites = [
        suite for suite in test_suites if suite.get("available")
    ]

    def run_suite(candidate, suite, code_override=None):
        code = (
            code_override
            if code_override is not None
            else candidate["code"]
        )
        candidate_entry = (
            extract_main_function(code)
            or candidate.get("entryPoint")
            or seed_entry
        )
        execution = execute_in_sandbox(
            code, suite["tests"], candidate_entry
        )
        return {
            "suiteId": suite["id"],
            "suiteLabel": suite["label"],
            "model": suite["model"],
            "modelLabel": suite["label"],
            "provider": suite["provider"],
            "passed": execution.get("passed"),
            "durationMs": execution.get("durationMs"),
            "stdout": execution.get("stdout", ""),
            "stderr": execution.get("stderr", ""),
            "exitCode": execution.get("exitCode"),
        }

    def run_trusted(candidate, code_override=None):
        if not trusted_tests:
            return None
        code = (
            code_override
            if code_override is not None
            else candidate["code"]
        )
        candidate_entry = (
            extract_main_function(code)
            or candidate.get("entryPoint")
            or seed_entry
        )
        return execute_in_sandbox(
            code, trusted_tests, candidate_entry
        )

    for candidate in valid_candidates:
        candidate["initialEvidence"] = []

    if available_suites:
        with ThreadPoolExecutor(
            max_workers=min(
                len(valid_candidates) * len(available_suites), 8
            )
        ) as pool:
            future_map = {}
            for candidate in valid_candidates:
                for suite in available_suites:
                    future = pool.submit(
                        run_suite, candidate, suite
                    )
                    future_map[future] = candidate

            for future in as_completed(future_map):
                future_map[future]["initialEvidence"].append(
                    future.result()
                )

    for candidate in valid_candidates:
        candidate["initialEvidence"].sort(
            key=lambda evidence: suite_order.get(
                evidence["suiteId"], 99
            )
        )

    if trusted_tests:
        with ThreadPoolExecutor(
            max_workers=min(len(valid_candidates), 4)
        ) as pool:
            future_map = {
                pool.submit(run_trusted, candidate): candidate
                for candidate in valid_candidates
            }
            for future in as_completed(future_map):
                future_map[future]["trustedInitial"] = (
                    future.result()
                )

    disagreements = []
    repair_targets = []

    for candidate in valid_candidates:
        verdicts = [
            evidence.get("passed")
            for evidence in candidate["initialEvidence"]
            if evidence.get("passed") is not None
        ]

        if len(verdicts) < 2:
            candidate["controller"] = {
                "action": "STOP_UNRESOLVED",
                "reason": (
                    "Not enough independent verifier evidence was "
                    "available to justify intervention."
                ),
                "verifierTrust": "insufficient-evidence",
                "evidenceCalls": len(verdicts),
            }
        elif verdicts[0] is True and verdicts[1] is True:
            candidate["controller"] = {
                "action": "ACCEPT_PROVISIONALLY",
                "reason": "Both independent generated verifiers passed.",
                "verifierTrust": "corroborated-pass",
                "evidenceCalls": 2,
            }
        elif verdicts[0] is False and verdicts[1] is False:
            candidate["controller"] = {
                "action": "REPAIR",
                "reason": (
                    "Both independent generated verifiers found a "
                    "failure."
                ),
                "verifierTrust": "corroborated-failure",
                "evidenceCalls": 2,
            }
            repair_targets.append(candidate)
        else:
            candidate["controller"] = {
                "action": "ACQUIRE_MORE_EVIDENCE",
                "reason": (
                    "Generated verifiers disagree; repair is blocked "
                    "until more evidence is collected."
                ),
                "verifierTrust": "conflicted",
                "evidenceCalls": 2,
            }
            disagreements.append(candidate)

    if disagreements:
        tie_config = (
            model_configs[2]
            if len(model_configs) > 2
            else model_configs[0]
        )
        tie_suite = build_suite(
            (
                "tie",
                "Tie-break verifier",
                tie_config,
                "discriminating",
            )
        )
        test_suites.append(tie_suite)

        if tie_suite.get("available"):
            with ThreadPoolExecutor(
                max_workers=min(len(disagreements), 4)
            ) as pool:
                future_map = {
                    pool.submit(
                        run_suite, candidate, tie_suite
                    ): candidate
                    for candidate in disagreements
                }

                for future in as_completed(future_map):
                    candidate = future_map[future]
                    candidate["initialEvidence"].append(
                        future.result()
                    )
                    passed_count = sum(
                        evidence.get("passed") is True
                        for evidence in candidate[
                            "initialEvidence"
                        ]
                    )
                    failed_count = sum(
                        evidence.get("passed") is False
                        for evidence in candidate[
                            "initialEvidence"
                        ]
                    )

                    if failed_count > passed_count:
                        candidate["controller"] = {
                            "action": "REPAIR",
                            "reason": (
                                "The tie-break verifier resolved the "
                                "disagreement toward failure."
                            ),
                            "verifierTrust": "majority-failure",
                            "evidenceCalls": 3,
                        }
                        repair_targets.append(candidate)
                    else:
                        candidate["controller"] = {
                            "action": "ACCEPT_PROVISIONALLY",
                            "reason": (
                                "The tie-break verifier resolved the "
                                "disagreement toward pass."
                            ),
                            "verifierTrust": "majority-pass",
                            "evidenceCalls": 3,
                        }
        else:
            for candidate in disagreements:
                candidate["controller"] = {
                    "action": "STOP_UNRESOLVED",
                    "reason": (
                        "The initial verifiers disagreed and the "
                        "tie-break verifier was unavailable."
                    ),
                    "verifierTrust": "conflicted-unresolved",
                    "evidenceCalls": 2,
                }

    def repair_candidate(candidate):
        relevant_suites = [
            suite
            for suite in test_suites
            if suite.get("available")
            and any(
                evidence["suiteId"] == suite["id"]
                for evidence in candidate["initialEvidence"]
            )
        ]
        evidence_lines = []
        for evidence in candidate["initialEvidence"]:
            status = "PASS" if evidence.get("passed") else "FAIL"
            diagnostic = (
                evidence.get("stderr")
                or evidence.get("stdout")
                or ""
            ).strip()
            if diagnostic:
                diagnostic = diagnostic[-1800:]
            evidence_lines.append(
                f'{evidence["suiteLabel"]}: {status}\n{diagnostic}'
            )
        evidence_summary = "\n\n".join(evidence_lines)

        started = time.perf_counter()
        try:
            config = config_by_key[candidate["key"]]
            repaired_code = repair_from_evidence(
                get_client(candidate["model"], config),
                prompt,
                candidate["code"],
                evidence_summary,
                model=candidate["model"],
            )
            repair_ms = round(
                (time.perf_counter() - started) * 1000
            )

            repaired_evidence = []
            with ThreadPoolExecutor(
                max_workers=min(len(relevant_suites), 3)
            ) as pool:
                futures = [
                    pool.submit(
                        run_suite,
                        candidate,
                        suite,
                        repaired_code,
                    )
                    for suite in relevant_suites
                ]
                for future in as_completed(futures):
                    repaired_evidence.append(
                        future.result()
                    )

            repaired_evidence.sort(
                key=lambda evidence: suite_order.get(
                    evidence["suiteId"], 99
                )
            )
            candidate["repair"] = {
                "attempted": True,
                "code": repaired_code,
                "generationMs": repair_ms,
                "evidence": repaired_evidence,
                "error": None,
            }
        except Exception as exc:
            candidate["repair"] = {
                "attempted": True,
                "code": candidate["code"],
                "generationMs": round(
                    (time.perf_counter() - started) * 1000
                ),
                "evidence": candidate["initialEvidence"],
                "error": str(exc),
            }

    if repair_targets:
        with ThreadPoolExecutor(
            max_workers=min(len(repair_targets), 4)
        ) as pool:
            futures = [
                pool.submit(repair_candidate, candidate)
                for candidate in repair_targets
            ]
            for future in as_completed(futures):
                future.result()

    if trusted_tests:
        with ThreadPoolExecutor(
            max_workers=min(len(valid_candidates), 4)
        ) as pool:
            future_map = {}
            for candidate in valid_candidates:
                final_code = (
                    candidate.get("repair", {}).get("code")
                    or candidate["code"]
                )
                future = pool.submit(
                    run_trusted, candidate, final_code
                )
                future_map[future] = candidate

            for future in as_completed(future_map):
                candidate = future_map[future]
                candidate["trustedFinal"] = future.result()

                initial_pass = candidate.get(
                    "trustedInitial", {}
                ).get("passed")
                final_pass = candidate.get(
                    "trustedFinal", {}
                ).get("passed")
                intervened = bool(
                    candidate.get("repair", {}).get(
                        "attempted"
                    )
                )

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
        if candidate.get("repair", {}).get("attempted"):
            final_evidence = candidate["repair"].get(
                "evidence", []
            )
            passes = sum(
                evidence.get("passed") is True
                for evidence in final_evidence
            )
            failures = sum(
                evidence.get("passed") is False
                for evidence in final_evidence
            )
            candidate["finalDecision"] = (
                "ACCEPT_AFTER_REPAIR"
                if passes > failures
                else "STOP_UNRESOLVED"
            )
        else:
            candidate["finalDecision"] = candidate.get(
                "controller", {}
            ).get("action", "UNKNOWN")

    summary = {
        "acceptedWithoutRepair": sum(
            candidate.get("controller", {}).get("action")
            == "ACCEPT_PROVISIONALLY"
            for candidate in valid_candidates
        ),
        "repairsAttempted": sum(
            bool(
                candidate.get("repair", {}).get("attempted")
            )
            for candidate in valid_candidates
        ),
        "evidenceEscalations": len(disagreements),
        "recoveries": sum(
            candidate.get("interventionOutcome")
            == "RECOVERY"
            for candidate in valid_candidates
        ),
        "harms": sum(
            candidate.get("interventionOutcome") == "HARM"
            for candidate in valid_candidates
        ),
        "unresolved": sum(
            candidate.get("finalDecision") == "STOP_UNRESOLVED"
            for candidate in valid_candidates
        ),
    }

    return jsonify(
        {
            "prompt": prompt,
            "evidenceType": "multi-verifier-generated-tests",
            "controllerPolicy": (
                "verify-twice-escalate-on-disagreement-"
                "repair-on-corroborated-failure"
            ),
            "trustedTestsProvided": bool(trusted_tests),
            "models": [
                public_model_config(config)
                for config in model_configs
            ],
            "testSuites": test_suites,
            "summary": summary,
            "candidates": candidates,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))

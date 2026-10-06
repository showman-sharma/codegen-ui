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

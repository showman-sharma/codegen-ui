# backend/app.py
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI

from prompters import (
    PHP_Enhancer,
    add_comments_to_code,
    explain_code,
    generate_SCoT,
    generate_one_completion_SCoT,
    generate_one_completion_basic,
    generate_test_cases,
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
            default_headers={
                "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://codegen-ui-xi.vercel.app"),
                "X-Title": os.getenv("OPENROUTER_APP_NAME", "CodeGen UI"),
            },
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for direct OpenAI models.")
    return OpenAI(api_key=api_key)


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

# backend/app.py
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
from dotenv import load_dotenv

from prompters import (
    generate_one_completion_basic,
    generate_SCoT,
    generate_one_completion_SCoT,
    generate_one_completion_self_consistency,
    PHP_Enhancer,
    SR_Enhancer
)

load_dotenv()
app = Flask(__name__)
CORS(app)
openai.api_key = os.getenv("OPENAI_API_KEY")


@app.route('/api/generate-scot', methods=['POST'])
def api_generate_scot():
    prompt = request.json.get('prompt', '')
    scot = generate_SCoT(prompt)
    return jsonify({"scot": scot})


@app.route('/api/generate-code', methods=['POST'])
def api_generate_code():
    data = request.json or {}
    prompt = data.get('prompt', '')
    num_samples = data.get('numSamples', 1)
    scot = data.get('scot')
    if scot:
        code = generate_one_completion_SCoT(prompt)
    else:
        if num_samples and num_samples > 1:
            code = generate_one_completion_self_consistency(prompt, num_samples)
        else:
            code = generate_one_completion_basic(prompt)
    return jsonify({"code": code})


@app.route('/api/suggest-refine', methods=['POST'])
def api_suggest_refine():
    data = request.json or {}
    code = data.get('code', '')
    prompt = data.get('prompt', '')
    suggestion = SR_Enhancer(code, prompt, max_iterations=1)
    return jsonify({"suggestion": suggestion})


@app.route('/api/refine-code', methods=['POST'])
def api_refine_code():
    data = request.json or {}
    code = data.get('code', '')
    suggestion = data.get('suggestion', '')
    refined = PHP_Enhancer(code, suggestion, max_iterations=1)
    return jsonify({"refinedCode": refined})


@app.route('/api/auto-enhance', methods=['POST'])
def api_auto_enhance():
    data = request.json or {}
    code = data.get('code', '')
    prompt = data.get('prompt', '')
    enhanced = PHP_Enhancer(code, prompt, max_iterations=1)
    return jsonify({"enhancedCode": enhanced})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

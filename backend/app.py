# backend/app.py
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv

from prompters import (
    generate_one_completion_basic,
    generate_SCoT,
    generate_one_completion_SCoT,
    generate_one_completion_self_consistency,
    PHP_Enhancer,
    suggest_refinement,
    refine_code,
    explain_code,
    add_comments_to_code
)

load_dotenv()
app = Flask(__name__)
CORS(app)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))  # Correct way now

@app.route('/api/generate-scot', methods=['POST'])
def api_generate_scot():
    prompt = request.json.get('prompt', '')
    model = request.json.get('model', 'gpt-3.5-turbo')
    scot = generate_SCoT(client, prompt, model)
    return jsonify({"scot": scot})

@app.route('/api/generate-code', methods=['POST'])
def api_generate_code():
    data = request.json or {}
    prompt = data.get('prompt', '')
    num_samples = data.get('numSamples', 1)
    scot = data.get('scot')
    model = data.get('model', 'gpt-3.5-turbo')

    if scot:
        code = generate_one_completion_SCoT(client, prompt, model)
    else:
        if num_samples and num_samples > 1:
            code = generate_one_completion_self_consistency(client, prompt, num_samples, model)
        else:
            code = generate_one_completion_basic(client, prompt,model)
    return jsonify({"code": code})

@app.route('/api/suggest-refine', methods=['POST'])
def api_suggest_refine():
    data = request.json or {}
    code = data.get('code', '')
    prompt = data.get('prompt', '')
    model = data.get('model', 'gpt-3.5-turbo')
    suggestion = suggest_refinement(client, code, prompt, model=model)
    return jsonify({"suggestion": suggestion})

@app.route('/api/refine-code', methods=['POST'])
def api_refine_code():
    data = request.json or {}
    code = data.get('code', '')
    suggestion = data.get('suggestion', '')
    model = data.get('model', 'gpt-3.5-turbo')
    refined = refine_code(client, code, suggestion, model=model)
    return jsonify({"refinedCode": refined})

@app.route('/api/auto-enhance', methods=['POST'])
def api_auto_enhance():
    data = request.json or {}
    code = data.get('code', '')
    prompt = data.get('prompt', '')
    model = data.get('model', 'gpt-3.5-turbo')
    enhanced = PHP_Enhancer(client, code, prompt, max_iterations=1, model=model)
    return jsonify({"enhancedCode": enhanced})

@app.route('/api/explain-code', methods=['POST'])
def api_explain_code():
    data = request.json or {}
    code = data.get('code', '')
    model = data.get('model', 'gpt-3.5-turbo')
    explanation = explain_code(client, code, model=model)
    return jsonify({"explanation": explanation})

@app.route('/api/comment-code', methods=['POST'])
def api_comment_code():
    data = request.json or {}
    code = data.get('code', '')
    model = data.get('model', 'gpt-3.5-turbo')
    commented = add_comments_to_code(client, code, model=model)
    return jsonify({"commentedCode": commented})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

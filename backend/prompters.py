# backend/prompters.py
import re
import openai

# --- Normalization for self-consistency ---
def perfect_normalize_code(source: str) -> str:
    import ast
    try:
        tree = ast.parse(source)
        from ast import fix_missing_locations
        # Assume PerfectNormalizer class is available or import from normalization module
        from normalization import PerfectNormalizer
        normalized = PerfectNormalizer().visit(tree)
        fix_missing_locations(normalized)
        return ast.dump(normalized, annotate_fields=True, include_attributes=False)
    except Exception as e:
        print(f"Error in perfect_normalize_code: {e}")
        return ""


def extract_clean_code(generated_text: str) -> str:
    """
    Extracts and cleans Python code from AI output.
    """
    code_blocks = re.findall(r"```(?:python)?\s*(.*?)\s*```", generated_text, re.DOTALL)
    if code_blocks:
        return max(code_blocks, key=len).strip()
    lines = generated_text.splitlines()
    code_started = False
    code_lines = []
    for line in lines:
        if not code_started and line.lstrip().startswith(('def ', 'class ', 'import ', 'from ')):
            code_started = True
        if code_started:
            code_lines.append(line)
    if code_lines:
        return "\n".join(code_lines).strip()
    return generated_text.strip()


def generate_one_completion_basic(prompt: str) -> str:
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Generate correct and complete Python code."},
            {"role": "user", "content": f"Complete the following function (do not add comments):\n\n{prompt}"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    raw = response.choices[0].message.content.strip()
    return extract_clean_code(raw)


def generate_SCoT(prompt: str) -> str:
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. First, generate a structured solving process."},
            {"role": "user", "content": f"Generate a structured chain-of-thought for this problem:\n\n{prompt}"}
        ],
        temperature=0.2,
        max_tokens=500
    )
    return response.choices[0].message.content.strip()


def generate_one_completion_SCoT(prompt: str) -> str:
    scot = generate_SCoT(prompt)
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Implement code from this SCoT."},
            {"role": "user", "content": f"Problem:\n{prompt}\n\nSCoT:\n{scot}\n\nImplement the code without comments."}
        ],
        temperature=0.1,
        max_tokens=400
    )
    raw = response.choices[0].message.content.strip()
    return extract_clean_code(raw)


def PHP_Enhancer(initial_code: str, problem: str, max_iterations: int = 1) -> str:
    # Hint generation
    hint_resp = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant."},
            {"role": "user", "content": f"{problem}\n\nHere is my code:\n```{initial_code}```\nGenerate a concise hint."}
        ],
        temperature=0.1,
        max_tokens=200
    )
    hint = hint_resp.choices[0].message.content.strip()
    if "no further hints" in hint.lower():
        return initial_code
    # Refinement
    refine_resp = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant."},
            {"role": "user", "content": f"Refine this code based on the hint:\n\nHint: {hint}\n\nCode:\n```{initial_code}```"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(refine_resp.choices[0].message.content.strip())


def SR_Enhancer(initial_code: str, problem: str, max_iterations: int = 3) -> str:
    current = initial_code
    for _ in range(max_iterations):
        # Critique
        crit_resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an expert Python programmer."},
                {"role": "user", "content": f"Critique this code for correctness, efficiency, edge cases:\n\nCode:\n```{current}```\nProblem:\n{problem}"}
            ],
            temperature=0.1,
            max_tokens=200
        )
        critique = crit_resp.choices[0].message.content.strip()
        if "no issues found" in critique.lower():
            break
        # Refine
        ref_resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a Python coding assistant."},
                {"role": "user", "content": f"Improve this code based on the critique:\n\nCritique:\n{critique}\n\nCode:\n```{current}```"}
            ],
            temperature=0.1,
            max_tokens=400
        )
        new_code = extract_clean_code(ref_resp.choices[0].message.content.strip())
        if new_code == current:
            break
        current = new_code
    return current


def generate_one_completion_self_consistency(prompt: str, num_samples: int = 5) -> str:
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant."},
            {"role": "user", "content": f"Complete the following function (do not add comments):\n\n{prompt}"}
        ],
        temperature=0.8,
        max_tokens=400,
        n=num_samples
    )
    completions = []
    for choice in response.choices:
        raw = choice.message.content.strip()
        cleaned = extract_clean_code(raw)
        completions.append(cleaned)
    from collections import Counter
    normalized_to_original = {}
    normalized_forms = []
    for code in completions:
        norm = perfect_normalize_code(code)
        normalized_forms.append(norm)
        normalized_to_original.setdefault(norm, []).append(code)
    most_common_norm, _ = Counter(normalized_forms).most_common(1)[0]
    return normalized_to_original[most_common_norm][0]

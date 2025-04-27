# backend/prompters.py
import re

def extract_clean_code(generated_text: str) -> str:
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

# Assume you have your PerfectNormalizer elsewhere or skip if not needed
def perfect_normalize_code(source: str) -> str:
    import ast
    try:
        tree = ast.parse(source)
        return ast.dump(tree, annotate_fields=True, include_attributes=False)
    except Exception as e:
        print(f"Error in perfect_normalize_code: {e}")
        return ""

def generate_one_completion_basic(client, prompt: str) -> str:
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Generate correct and complete Python code."},
            {"role": "user", "content": f"Complete the following function (no comments):\n\n{prompt}"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(response.choices[0].message.content.strip())

def generate_SCoT(client, prompt: str) -> str:
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Generate a structured solving process before coding."},
            {"role": "user", "content": f"Generate a structured chain-of-thought for the following problem:\n\n{prompt}"}
        ],
        temperature=0.2,
        max_tokens=500
    )
    return response.choices[0].message.content.strip()

def generate_one_completion_SCoT(client, prompt: str) -> str:
    scot = generate_SCoT(client, prompt)
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Implement the code based on this SCoT."},
            {"role": "user", "content": f"Problem:\n{prompt}\n\nSCoT:\n{scot}\n\nImplement the code without comments."}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(response.choices[0].message.content.strip())

def PHP_Enhancer(client, initial_code: str, problem: str, max_iterations: int = 1) -> str:
    hint_resp = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant."},
            {"role": "user", "content": f"{problem}\n\nHere is my code:\n```{initial_code}```\nGenerate a hint to improve it."}
        ],
        temperature=0.1,
        max_tokens=200
    )
    hint = hint_resp.choices[0].message.content.strip()
    if "no further hints" in hint.lower():
        return initial_code
    refine_resp = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant."},
            {"role": "user", "content": f"Refine this code based on the hint:\nHint: {hint}\nCode:\n```{initial_code}```"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(refine_resp.choices[0].message.content.strip())

def SR_Enhancer(client, initial_code: str, problem: str, max_iterations: int = 3) -> str:
    current = initial_code
    for _ in range(max_iterations):
        critique_resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an expert Python programmer."},
                {"role": "user", "content": f"Critique this code for correctness, efficiency, and edge cases:\n```{current}```\nProblem:\n{problem}"}
            ],
            temperature=0.1,
            max_tokens=200
        )
        critique = critique_resp.choices[0].message.content.strip()
        if "no issues found" in critique.lower():
            break
        refine_resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a Python coding assistant."},
                {"role": "user", "content": f"Refine this code based on critique:\nCritique: {critique}\nCode:\n```{current}```"}
            ],
            temperature=0.1,
            max_tokens=400
        )
        new_code = extract_clean_code(refine_resp.choices[0].message.content.strip())
        if new_code == current:
            break
        current = new_code
    return current

def generate_one_completion_self_consistency(client, prompt: str, num_samples: int = 5) -> str:
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a Python coding assistant."},
            {"role": "user", "content": f"Complete the following function:\n\n{prompt}"}
        ],
        temperature=0.8,
        max_tokens=400,
        n=num_samples
    )
    completions = []
    for choice in response.choices:
        completions.append(extract_clean_code(choice.message.content.strip()))
    from collections import Counter
    normalized_to_original = {}
    normalized_forms = []
    for code in completions:
        norm = perfect_normalize_code(code)
        normalized_forms.append(norm)
        normalized_to_original.setdefault(norm, []).append(code)
    from collections import Counter
    most_common_norm, _ = Counter(normalized_forms).most_common(1)[0]
    return normalized_to_original[most_common_norm][0]

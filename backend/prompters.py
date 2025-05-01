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

def generate_one_completion_basic(client, prompt: str, model: str = 'gpt-3.5-turbo') -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Generate correct and complete Python code."},
            {"role": "user", "content": f"Complete the following function (no comments):\n\n{prompt}"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(response.choices[0].message.content.strip())

def generate_SCoT(client, prompt: str, model: str = 'gpt-3.5-turbo') -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Generate a structured solving process before coding."},
            {"role": "user", "content": f"Generate a structured chain-of-thought for the following problem:\n\n{prompt}"}
        ],
        temperature=0.2,
        max_tokens=500
    )
    return response.choices[0].message.content.strip()

def generate_one_completion_SCoT(client, prompt: str, model: str = 'gpt-3.5-turbo') -> str:
    scot = generate_SCoT(client, prompt, model)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a Python coding assistant. Implement the code based on this SCoT."},
            {"role": "user", "content": f"Problem:\n{prompt}\n\nSCoT:\n{scot}\n\nImplement the code without comments."}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(response.choices[0].message.content.strip())


def PHP_Enhancer(client, initial_code: str, problem_statement: str,  max_iterations: int = 1, model: str = 'gpt-3.5-turbo', verbosity: int = 0) -> str:
    """
    Enhances a given Python solution code for a Human Eval–style problem using Progressive-Hint Prompting (PHP).
    
    The process is as follows:
      1. **Hint Generation:** The model reviews the problem prompt and candidate solution, then produces a concise hint
         (e.g., "Hint: Consider optimizing the loop boundary" or "Hint: Ensure edge cases for negative inputs are handled").
         If the solution is already optimal, it replies with "No further hints."
      2. **Refinement:** The hint is injected into a progressive prompt that asks the model to refine the solution code based on the hint.
      3. The process iterates until two consecutive outputs (after cleaning) are identical or no further hints are provided.
    
    Parameters:
        initial_code (str): The initial Python solution code.
        problem_statement (str): The Human Eval prompt (includes problem description, function signature, and docstring).
        max_iterations (int): Maximum number of refinement iterations.
        verbosity (int): If > 0, prints the hints and cleaned code at each iteration.
        
    Returns:
        str: The final refined Python code.
    """
    current_code = initial_code
    iteration = 0

    # Progressive-Hint Prompting uses a two-sentence structure.
    while iteration < max_iterations:
        try:
            progressive_prompt = problem_statement + "\n\n Hint:  The solution code is close to the following code:\n```\n" + current_code + "\n```"
            new_code = generate_one_completion_basic(client, progressive_prompt, model=model)
        except Exception as e:
            print(f"Refinement generation error: {e}")
            break

        
        # Clean both current and new code for reliable comparison.
        cleaned_current = extract_clean_code(current_code)
        cleaned_new = extract_clean_code(new_code)
        if verbosity:
            print(f"Cleaned Current Code:\n{cleaned_current}\n")
            print(f"Cleaned New Code:\n{cleaned_new}\n")
        
        # If no meaningful change, exit.
        if (cleaned_new) == (cleaned_current):
            break

        current_code = new_code
        iteration += 1
    return extract_clean_code(current_code)

def suggest_refinement(client, initial_code: str, problem: str, model: str = 'gpt-3.5-turbo') -> str:
    feedback_prompt = f"""
You are an expert Python programmer. The following is a prompt along with a candidate solution.
Analyze the provided solution code with respect to:
  - Correctness (does it compute the right result?),
  - Efficiency (are there unnecessary or brute-force computations?),
  - Handling of edge cases (will it pass all Human Eval test cases?).

Prompt:
{problem}

Candidate Solution Code:
{initial_code}

Provide a concise critique highlighting any potential issues. If the solution appears fully correct, efficient, and robust,
simply reply with "No issues found."
"""
    critique_resp = client.chat.completions.create(
        model=model,
        messages=[
                    {"role": "system", "content": "You are an expert Python programmer."},
                    {"role": "user", "content": feedback_prompt}
                ],
        temperature=0.1,
        max_tokens=200
    )
    critique = critique_resp.choices[0].message.content.strip()
    return critique

def refine_code(client, initial_code: str, critique: str, model: str = 'gpt-3.5-turbo') -> str:    
    current = initial_code
    if "no issues found" not in critique.lower():
        refine_resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a Python coding assistant."},
                {"role": "user", "content": f"Refine this code based on critique:\nCritique: {critique}\nCode:\n```{current}```"}
            ],
            temperature=0.1,
            max_tokens=400
        )
        new_code = extract_clean_code(refine_resp.choices[0].message.content.strip())
    current = new_code
    return current

def generate_one_completion_self_consistency(client, prompt: str, num_samples: int = 5, model: str = 'gpt-3.5-turbo') -> str:
    response = client.chat.completions.create(
        model=model,
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
    most_common_norm, _ = Counter(normalized_forms).most_common(1)[0]
    return normalized_to_original[most_common_norm][0]

def explain_code(client, code: str, model: str = 'gpt-3.5-turbo') -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a Python mentor."},
            {"role": "user", "content": f"Explain the following code in detail:\n\n```python\n{code}\n```"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return response.choices[0].message.content.strip()

def add_comments_to_code(client, code: str, model: str = 'gpt-3.5-turbo') -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a Python developer."},
            {"role": "user", "content": f"Add helpful inline comments to this Python code:\n\n```python\n{code}\n```"}
        ],
        temperature=0.1,
        max_tokens=400
    )
    return extract_clean_code(response.choices[0].message.content.strip())
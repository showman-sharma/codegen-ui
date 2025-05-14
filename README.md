# 🛠️ [CodeGen UI]([url](https://codegen-ui-xi.vercel.app/))

An advanced interactive platform for AI-driven Python code generation, progressive enhancement, and structured solution planning.

Designed for developers, researchers, and enthusiasts aiming to explore programmatic generation of clean and refined Python code through various advanced prompting strategies.

---

## 📦 Project Structure

```plaintext
codegen-ui/
├── backend/       # Flask-based API server
├── frontend/      # ReactJS-based user interface
├── README.md      # Project documentation
├── LICENSE        # Project license
├── .gitignore     # Ignored files
```

---

## 🚀 Features

- 📜 **Structured Chain of Thought (SCoT) Generation** — Plan code systematically before writing.
- 🎯 **Self-Consistency Sampling** — Generate multiple solutions and pick the most consistent one.
- 🧹 **Progressive Enhancement (PHP Style)** — Iteratively improve code quality.
- 🔄 **Automated Refinement** — Suggest and apply improvements through LLM critique.
- 🎨 **Syntax-Highlighted, Editable Code Arena** — Interactive Python editor powered by AceEditor.
- 🛡️ **Fully environment-variable driven**, clean separation between frontend and backend.

---

## 🧰 Technologies Used

| Stack        | Technologies              |
|--------------|----------------------------|
| Frontend     | ReactJS, AceEditor          |
| Backend      | Flask, Flask-CORS, OpenAI API |
| Languages    | Python, JavaScript          |
| DevTools     | dotenv, npm, pip, Git        |

---

## 🛠️ Local Setup Guide

### Backend Setup

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate  # (Windows)
source .venv/bin/activate # (Mac/Linux)

pip install -r requirements.txt

# Setup environment variables
copy .env.example .env

# Start the server
python app.py
```

- Backend available at: `http://localhost:5000`

---

### Frontend Setup

```bash
cd frontend
npm install

# Setup environment variables
copy .env.example .env

# Start the React app
npm start
```

- Frontend available at: `http://localhost:3000`
- Frontend proxies requests to backend automatically.

---

## ⚙️ Environment Variables

### Backend `.env.example`

```plaintext
OPENAI_API_KEY=your-openai-api-key-here
```

---

### Frontend `.env.example`

```plaintext
REACT_APP_API_URL=http://localhost:5000
```

---

## 📦 Deployment

| Layer    | Platform           |
|----------|--------------------|
| Backend  | Railway / Render    |
| Frontend | Vercel / Netlify    |

- Set environment variables correctly on the deployment platform.
- Update `REACT_APP_API_URL` in frontend to your deployed backend URL.

---

## 🛡️ License

This project is licensed under a **Custom Personal-Use License**.

```
- Personal, academic, and non-commercial usage is permitted.
- Commercial usage (including selling, licensing, or offering as a paid service) is strictly prohibited without prior written consent from the author.
- Redistribution with attribution is permitted for non-commercial purposes.
- The software is provided "as is" without warranties or guarantees of any kind.
```

See [LICENSE](./LICENSE) for full details.

---

## 📈 Future Enhancements

- 🧠 Smart model selection (GPT-3.5, GPT-4)
- 📑 Multifile code generation capabilities
- 🛡️ Authentication layer for secure usage
- 🏗️ Pluggable enhancement pipelines (Test Chains, Critique Chains)

---

## 👤 Author

**Anirudh Sharma**  
[GitHub](https://github.com/your-github) • [LinkedIn](https://linkedin.com/in/your-linkedin)

---

## 📢 Disclaimer

This software is experimental and intended for educational and research purposes only.  
Commercialization without explicit permission is prohibited.

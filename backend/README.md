# Code Generation UI - Backend

This is a minimal Flask backend providing endpoints for the React UI.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```
3. Run the server:
   ```bash
   python app.py
   ```
The backend will be available at `http://localhost:5000`.

## Endpoints

- `POST /api/generate-scot`  
- `POST /api/generate-code`  
- `POST /api/suggest-refine`  
- `POST /api/refine-code`  
- `POST /api/auto-enhance`  
Each expects JSON and returns JSON.


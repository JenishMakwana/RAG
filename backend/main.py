import uvicorn
import sys
import os

# Add the parent directory of 'app' to sys.path so that 'from app... ' or relative imports work
# depending on how it's started.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    # When running from here, 'app.main:app' refers to backend/app/main.py
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)

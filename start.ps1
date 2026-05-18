# Start script for Legal Case Law RAG Assistant

Write-Host "Starting Legal Case Law RAG Assistant..." -ForegroundColor Green

# Start Backend
Write-Host "Starting Backend API..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { cd backend; ..\myenv\Scripts\activate; uvicorn app.main:app --reload }"

# Start Frontend
Write-Host "Starting Frontend (React/Vite)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { cd frontend-react; npm run dev }"

Write-Host "Services are starting in separate windows." -ForegroundColor Green
Write-Host "Backend will be available at http://127.0.0.1:8000"
Write-Host "Frontend will be available at the URL shown in the Vite console"

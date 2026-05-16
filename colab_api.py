import nest_asyncio
from pyngrok import ngrok
import uvicorn
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import os
import shutil

# Import process functions from app.py
from app import process_image, process_video

app_api = FastAPI(title="Video & Image Moderation API")

@app_api.post("/moderate/image")
async def moderate_image(file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        res = process_image(
            image_path=temp_path, 
            apply_guard=True, 
            model_variant="V6 Task-Gated", 
            enabled_branches=["V", "S", "N"], 
            enabled_modalities=["CLIP", "YOLO", "Gore", "SelfHarm", "NSFW"]
        )
        verdict_md = res[0]
        # "FLAGGED" or "VI PHẠM" indicates unsafe content
        is_flagged = "FLAGGED" in verdict_md or "VI PHẠM" in verdict_md
        
        os.remove(temp_path)
        return JSONResponse({"is_flagged": is_flagged, "verdict": verdict_md})
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return JSONResponse({"error": str(e)}, status_code=500)

@app_api.post("/moderate/video")
async def moderate_video(file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        res = process_video(
            video_path=temp_path, 
            top_k=6, 
            apply_guard=True, 
            model_variant="V6 Task-Gated", 
            enabled_branches=["V", "S", "N"], 
            enabled_modalities=["CLIP", "Flow", "YOLO", "Gore", "SelfHarm", "NSFW"]
        )
        verdict_md = res[0]
        is_flagged = "FLAGGED" in verdict_md or "VI PHẠM" in verdict_md
        
        os.remove(temp_path)
        return JSONResponse({"is_flagged": is_flagged, "verdict": verdict_md})
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    ngrok_token = "3AqFRNPrZ3ZxPxatmmZvcR7GQuq_4g58XrQPYamfsgiGPs4Sj"
    ngrok.set_auth_token(ngrok_token)
    # Start ngrok tunnel
    public_url = ngrok.connect(8000).public_url
    print(f"============================================================")
    print(f"Ngrok Tunnel URL: {public_url}")
    print(f"Image API: {public_url}/moderate/image")
    print(f"Video API: {public_url}/moderate/video")
    print(f"============================================================")
    
    # Run FastAPI
    nest_asyncio.apply()
    uvicorn.run(app_api, host="0.0.0.0", port=8000)

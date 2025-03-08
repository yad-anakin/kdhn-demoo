from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from openai import OpenAI
from dotenv import load_dotenv
import re

# Load environment variables
load_dotenv()

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request model
class ChatRequest(BaseModel):
    message: str
    systemPrompt: str
    isNewChat: bool = False
    isGreeting: bool = False
    username: str = "guest"

# Store conversation histories
conversations = {}

@app.post("/chat/{agent_type}")
async def chat_medical(agent_type: str, request: ChatRequest):
    if agent_type not in ["med-info", "med-calculator"]:
        raise HTTPException(status_code=400, detail="Invalid agent type")
        
    try:
        # Only log essential information
        print(f"Processing {agent_type} request...")
        
        if request.isNewChat:
            conversations[agent_type] = []
        
        if agent_type not in conversations:
            conversations[agent_type] = []
        
        # Add user message
        conversations[agent_type].append({"role": "user", "content": request.message})
        
        # Modify system prompt based on context
        system_prompt = request.systemPrompt
        if not request.isGreeting:
            # Remove any greeting instructions if it's not a greeting
            system_prompt = re.sub(r'Hello.*?KDHN\.', '', system_prompt, flags=re.DOTALL)
        
        messages = [
            {"role": "system", "content": system_prompt},
            *conversations[agent_type]
        ]
        
        try:
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages,
                temperature=0.7,
                max_tokens=500,
                presence_penalty=0.6,  # Encourage more direct responses
                frequency_penalty=0.2   # Reduce repetition
            )
            
            assistant_message = response.choices[0].message.content
            conversations[agent_type].append({"role": "assistant", "content": assistant_message})
            
            # Log completion
            print(f"✓ {agent_type} request completed")
            
            return {"response": assistant_message}
        except Exception as openai_error:
            print(f"✗ OpenAI API error: {str(openai_error)}")
            raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(openai_error)}")
            
    except Exception as e:
        print(f"✗ Server error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
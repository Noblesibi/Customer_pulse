import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config(); // Reads .env in current directory

async function run() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    if(data.models) {
      console.log("Models:", data.models.map(m => m.name));
    } else {
      console.log("Response:", data);
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
run();

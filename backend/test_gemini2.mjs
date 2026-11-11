import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: 'src/.env', override: true });
dotenv.config({ path: '.env', override: true });

const models = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

async function run() {
  for (const modelName of models) {
    try {
      console.log("Testing:", modelName);
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Say hello");
      console.log("Success with", modelName);
      return; // Exit on first success
    } catch(e) {
      console.error("Failed", modelName, e.status);
    }
  }
}
run();

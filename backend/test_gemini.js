import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const apiKey = process.env.GEMINI_API_KEY;
console.log('Using API Key:', apiKey);

if (!apiKey || apiKey === 'your_gemini_api_key_here') {
  console.error('Error: GEMINI_API_KEY is placeholder.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const response = await model.generateContent('Hello, say test.');
    console.log('Success! Response:', response.response.text());
  } catch (err) {
    console.error('Gemini API call failed with error:');
    console.error(err);
  }
}

test();

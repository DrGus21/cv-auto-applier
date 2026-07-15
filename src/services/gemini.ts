import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not defined in the environment variables.');
}

const ai = new GoogleGenAI({ apiKey });

// Cache profile content
let cvProfileCached: any = null;

function getCVProfile(): any {
  if (cvProfileCached) return cvProfileCached;
  try {
    const profilePath = path.resolve(__dirname, '../../cv-profile.json');
    if (fs.existsSync(profilePath)) {
      const data = fs.readFileSync(profilePath, 'utf8');
      cvProfileCached = JSON.parse(data);
      return cvProfileCached;
    }
  } catch (error) {
    console.error('Error reading cv-profile.json:', error);
  }
  return {};
}

// Queue system for Rate Limiting (Gemini Free Tier: 15 RPM max)
// We will enforce a minimum gap of 5000ms between calls
let lastCallTime = 0;
const MIN_GAP_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < MIN_GAP_MS) {
    const delay = MIN_GAP_MS - timeSinceLastCall;
    console.log(`[Gemini Rate Limiter] Throttling for ${delay}ms to respect Free Tier limit...`);
    await sleep(delay);
  }
  lastCallTime = Date.now();
}

/**
 * Sends a prompt to Gemini with retry logic on 429 errors (Too Many Requests).
 */
async function generateContentWithRetry(prompt: string, retries = 3, delayMs = 10000): Promise<string> {
  await throttle();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', // Using 1.5-flash for maximum cost efficiency and speed
      contents: prompt,
      config: {
        // Simple safety settings and system instructions can be added here if needed
        temperature: 0.3, // Keep responses deterministic and professional
      }
    });

    if (!response || !response.text) {
      throw new Error('Received empty response from Gemini API');
    }

    return response.text.trim();
  } catch (error: any) {
    console.error(`[Gemini Error]: ${error.message || error}`);
    
    // Check if error is due to rate limits (usually code 429)
    const isRateLimit = error.status === 429 || 
                        (error.message && error.message.includes('429')) ||
                        (error.message && error.message.toLowerCase().includes('quota'));
    
    if (isRateLimit && retries > 0) {
      console.warn(`[Gemini API] Rate limit reached. Retrying in ${delayMs / 1000}s... (${retries} retries left)`);
      await sleep(delayMs);
      return generateContentWithRetry(prompt, retries - 1, delayMs * 2);
    }
    
    throw error;
  }
}

/**
 * Answers a job application filter question based on the user's CV Profile.
 * @param question Text of the question extracted from the webpage.
 * @param jobContext Additional context like Job Title or Job Description.
 */
export async function answerFilterQuestion(question: string, jobContext?: string): Promise<string> {
  const profile = getCVProfile();
  
  const prompt = `
Eres un asistente de inteligencia artificial profesional. Tu tarea es ayudar a un candidato a postularse a ofertas de trabajo respondiendo preguntas filtro de formularios de postulación de manera concisa y natural, redactando en primera persona del singular (yo).

INFORMACIÓN DEL CANDIDATO (CV):
${JSON.stringify(profile, null, 2)}

${jobContext ? `CONTEXTO DEL PUESTO AL QUE SE POSTULA:\n${jobContext}\n` : ''}

PREGUNTA DEL FORMULARIO DE POSTULACIÓN:
"${question}"

INSTRUCCIONES DE RESPUESTA:
1. Responde de forma breve y profesional en 1 o 2 líneas como máximo.
2. Escribe siempre en primera persona (ej. "Tengo 3 años de experiencia...", "Mi pretensión salarial es...").
3. Sé completamente honesto basado en la información del candidato. Si la pregunta pide experiencia en algo que NO está en el CV, di de forma constructiva que no la tienes directamente pero tienes bases o interés en aprenderlo (ej: "No tengo experiencia directa en Angular, pero domino React y TypeScript lo cual facilitará mi adaptación").
4. Si la pregunta es sobre pretensión salarial, usa el valor de 'preferences.desiredSalaryPEN' (ej. "Mi pretensión salarial es de 4500 soles netos mensuales") o 'preferences.desiredSalaryUSD' si el puesto es internacional.
5. No uses marcas de formato markdown como negritas, viñetas ni comillas adicionales en la respuesta final. Genera solo la respuesta de texto plano directa.

RESPUESTA DEL CANDIDATO:`;

  console.log(`[Gemini Service] Requesting answer for question: "${question.substring(0, 60)}..."`);
  const response = await generateContentWithRetry(prompt);
  console.log(`[Gemini Service] Generated Answer: "${response}"`);
  return response;
}

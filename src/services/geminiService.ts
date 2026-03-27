import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface PredictionInput {
  locationName: string;
  currentWaitTime: number;
  historicalBaseline: number;
  weather: string;
  localEvents: string[];
  timeOfDay: string;
}

export interface PredictionOutput {
  recommendation: "GO NOW" | "WAIT";
  predictedWaitTime: number;
  reasoning: string;
  futureWaitTime: number;
  futureTime: string;
}

export async function getWaitTimePrediction(input: PredictionInput): Promise<PredictionOutput> {
  const prompt = `
    You are the "Wait Time Oracle" AI. 
    Analyze the following data for ${input.locationName}:
    - Current Wait Time: ${input.currentWaitTime} minutes
    - Historical Baseline for this time (${input.timeOfDay}): ${input.historicalBaseline} minutes
    - Weather: ${input.weather}
    - Local Events: ${input.localEvents.join(", ") || "None"}

    Predict if the wait time will get better or worse in the next 1-2 hours.
    Provide a clear recommendation (GO NOW or WAIT) and a predicted wait time.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendation: { type: Type.STRING, enum: ["GO NOW", "WAIT"] },
          predictedWaitTime: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          futureWaitTime: { type: Type.NUMBER },
          futureTime: { type: Type.STRING }
        },
        required: ["recommendation", "predictedWaitTime", "reasoning", "futureWaitTime", "futureTime"]
      }
    }
  });

  return JSON.parse(response.text);
}

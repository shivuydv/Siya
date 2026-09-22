import { GoogleGenAI } from "@google/genai";
import { getApiKey } from "./configService";
import { PersonalityMode, getSystemInstruction } from "./personalityService";

let chatSession: any = null;
let currentMode: PersonalityMode | null = null;
let currentSessionUser: string | null = null;

export function resetSiaSession() {
  chatSession = null;
  currentMode = null;
  currentSessionUser = null;
}

export async function getSiaResponse(
  prompt: string,
  history: { sender: "user" | "siya"; text: string }[] = [],
  mode: PersonalityMode = "Free",
  userName: string = "",
  userEmail: string = ""
): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key not found. Please add your Gemini API Key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = getSystemInstruction(mode, userName, userEmail);
  const sessionUserKey = `${userName}:${userEmail}:${mode}`;

  if (!chatSession || currentSessionUser !== sessionUserKey) {
    let formattedHistory: any[] = [];
    
    // Group messages by role to avoid consecutive user/model turns
    let currentRole = "";
    let currentText = "";
    
    for (const msg of history) {
      const role = msg.sender === "user" ? "user" : "model";
      if (role === currentRole) {
        currentText += "\n" + msg.text;
      } else {
        if (currentRole !== "") {
          formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
        }
        currentRole = role;
        currentText = msg.text;
      }
    }
    if (currentRole !== "") {
      formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
    }
    
    // Ensure history doesn't start with 'model'
    if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
      formattedHistory.shift();
    }

    chatSession = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
      },
      history: formattedHistory
    });
    currentMode = mode;
    currentSessionUser = sessionUserKey;
  }

  const response = await chatSession.sendMessage({ message: prompt });
  return response.text;
}

export async function getSiaAudio(text: string): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Kore", // Using Kore for Siya's voice
          },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("Failed to generate TTS audio");
  }

  return base64Audio;
}

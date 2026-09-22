import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";
import { PersonalityMode, getSystemInstruction } from "./personalityService";

let globalActiveSession: any = null;

export class LiveSessionManager {
  private isActive: boolean = false;
  private ai: GoogleGenAI | null = null;
  private sessionPromise: Promise<any> | null = null;
  
  // Microphone & Input Audio
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Playback & Output Audio
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private sessionConnected: boolean = false;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  
  private mode: PersonalityMode = "Free";
  private userName: string = "";
  private userEmail: string = "";
  private idleTimer: number | null = null;
  private readonly IDLE_TIMEOUT_MS = 60000;
  
  // State Locks
  private isPlaying: boolean = false;
  private isGenerating: boolean = false;
  public isMuted: boolean = false;

  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "siya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onError: (message: string) => void = () => {};

  private updateState(state: "idle" | "listening" | "processing" | "speaking") {
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    if (state === "processing" || state === "speaking") {
      this.isGenerating = true;
    } else {
      this.isGenerating = false;
    }
    
    if (state === "listening") {
      this.idleTimer = window.setTimeout(() => {
        if (this.sessionPromise && this.isActive) {
          this.sessionPromise.then((session: any) => {
            session.sendRealtimeInput({ text: "SYSTEM_EVENT: The user has been completely silent for 60 seconds. Break the silence by proactively checking on them according to your current personality mode. Keep it natural." });
          });
        }
      }, this.IDLE_TIMEOUT_MS);
    }
    
    this.onStateChange(state);
  }

  constructor(mode: PersonalityMode = "Free", userName: string = "", userEmail: string = "") {
    this.mode = mode;
    this.userName = userName;
    this.userEmail = userEmail;
  }

  async start() {
    // 1. STRICT SINGLETON ENFORCEMENT
    if (globalActiveSession) {
      console.log("Terminating duplicate AI session");
      globalActiveSession.stop();
    }
    globalActiveSession = this;
    this.isActive = true;

    try {
      this.updateState("processing");

      // Initialize Audio Contexts with Smart TV and older WebKit fallback
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext) {
        try {
          this.audioContext = new AudioContextClass({ sampleRate: 16000 });
        } catch {
          this.audioContext = new AudioContextClass();
        }
      }
      if (!this.playbackContext) {
        try {
          this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
        } catch {
          this.playbackContext = new AudioContextClass();
        }
      }
      if (this.playbackContext.state === 'suspended') {
        this.playbackContext.resume();
      }
      this.nextPlayTime = this.playbackContext.currentTime;

      const { getApiKey } = await import("./configService");
      const apiKey = await getApiKey();

      if (!this.isActive) return;
      if (!apiKey) {
        throw new Error("Missing Gemini API Key");
      }

      this.ai = new GoogleGenAI({ apiKey });

      // Request Microphone Access with fallback for Smart TVs and low-spec devices
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 16000,
          } 
        });
      } catch (micErr) {
        // Fallback for Smart TVs or Android TVs where strict audio constraints fail
        console.warn("Strict mic constraints failed, attempting basic audio request:", micErr);
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!this.isActive) {
        this.stopMediaStream();
        return;
      }

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise || !this.isActive || !this.sessionConnected) return;
        
        // 2. ECHO PREVENTION & STT MUTING: Do not send audio if AI is speaking
        
        
        const inputData = e.inputBuffer.getChannelData(0);

        // Noise Gate
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        
        const rms = Math.sqrt(sumSquares / inputData.length);
        const NOISE_GATE_THRESHOLD = 0.015;
        
        if (this.isPlaying && rms > 0.06) {
           console.log("Local VAD detected user speech while playing, interrupting.");
           this.stopPlayback();
           this.updateState("listening");
        }
        

        const buffer = new ArrayBuffer(inputData.length * 2);
        const view = new DataView(buffer);
        const pcm16 = new Int16Array(buffer);
        
        for (let i = 0; i < inputData.length; i++) {
          let s = rms < NOISE_GATE_THRESHOLD ? 0 : Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          view.setInt16(i * 2, pcm16[i], true);
        }

        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then((session: any) => {
          session.sendRealtimeInput({ audio: { mimeType: 'audio/pcm;rate=16000', data: base64Data } });
        }).catch((err: any) => {});
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      const systemInstruction = getSystemInstruction(this.mode, this.userName, this.userEmail);

      // Connect to Live API
      this.sessionConnected = false;
      const connectPromise = this.ai!.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            this.sessionConnected = true;
            if (!this.isActive) {
              this.stop();
              return;
            }
            console.log("Live API Connected");
            this.updateState("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!this.isActive) return;
            
            // 3. STOP/CHUP HO JAO COMMAND HANDLING VIA SPEECH RECOGNITION
            const transcription = message.serverContent?.inputTranscription?.text || message.serverContent?.interimInputTranscription?.text;
            if (transcription) {
              const lowerText = transcription.toLowerCase();
              if (lowerText.includes("stop") || lowerText.includes("be quiet") || lowerText.includes("silent") || lowerText.includes("chup ho") || lowerText.includes("shut up") || lowerText.includes("shant")) {
                console.log("Stop command heard from user speech, halting immediately.");
                this.stopPlayback();
                this.updateState("listening");
                if (this.sessionPromise) {
                   this.sessionPromise.then((session: any) => {
                     if (session && this.sessionConnected) {
                       session.sendRealtimeInput({ text: "SYSTEM_EVENT: User forcefully asked you to stop talking. Stop instantly." });
                     }
                   }).catch(() => {});
                }
                return; // Ignore rest of message
              }
            }
            
            // Handle Model Turn
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  this.updateState("speaking");
                  this.playAudioChunk(part.inlineData.data);
                }
                if (part.text) {
                   let cleanText = part.text.replace(/(ha)+/gi, "").replace(/(he)+/gi, "").replace(/(hi)+/gi, "").replace(/(ho)+/gi, "");
                   if (cleanText.trim().length > 0) {
                     this.onMessage("siya", part.text);
                   }
                }
              }
            }

            // 4. INSTANT INTERRUPTION
            if (message.serverContent?.interrupted) {
              console.log("Server indicated user interrupted AI. Halting playback.");
              this.stopPlayback();
              this.updateState("listening");
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else {
                    let websiteName = args.query.trim();
                    let websiteUrl = websiteName.replace(/\s+/g, "");
                    if (websiteUrl.startsWith("http://") || websiteUrl.startsWith("https://") || websiteUrl.startsWith("about:")) {
                      url = websiteUrl;
                    } else {
                      if (!websiteUrl.includes(".")) {
                        websiteUrl += ".com";
                      }
                      url = `https://www.${websiteUrl}`;
                    }
                  }
                  
                  this.onCommand(url);
                  
                  this.sessionPromise?.then((session: any) => {
                     if (session && this.sessionConnected) {
                       session.sendToolResponse({
                         functionResponses: [{
                           name: call.name,
                           id: call.id,
                           response: { result: "Action executed successfully in the browser." }
                         }]
                       });
                     }
                  }).catch(() => {});
                }
              }
            }
          },
          onclose: (e?: any) => {
            console.log("Live API Closed", e);
            const wasConnected = this.sessionConnected;
            this.sessionConnected = false;
            if (wasConnected && this.isActive) {
              this.updateState("idle");
            }
            this.stop();
          },
          onerror: (err: any) => {
            console.warn("Live API Notice/Error:", err);
            this.sessionConnected = false;
            this.stop();
          }
        }
      });

      // Attach rejection handler immediately to prevent Unhandled Rejection
      this.sessionPromise = connectPromise
        .then((session) => {
          return session;
        })
        .catch((err: any) => {
          console.warn("Live API WebSocket connect error caught:", err);
          this.sessionConnected = false;
          return null;
        });

      await this.sessionPromise;
    } catch (error: any) {
      if (error?.message === "Permission denied" || error?.name === "NotAllowedError") {
        console.warn("Microphone permission denied by user.");
      } else {
        console.warn("Failed to establish Live Session, will use voice fallback:", error);
      }
      this.stop();
      throw error;
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      if (this.playbackContext.state === 'suspended') {
        this.playbackContext.resume();
      }
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const dataView = new DataView(bytes.buffer);
      const pcmLength = Math.floor(len / 2);
      const audioBuffer = this.playbackContext.createBuffer(1, pcmLength, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < pcmLength; i++) {
        channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      // Track active sources to stop them completely on interruption
      this.activeSources.add(source);
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        this.activeSources.delete(source);
        if (!this.isActive) return;
        
        // If queue is completely finished
        if (this.activeSources.size === 0 && this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.updateState("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    // 5. TRUE STOP OF SCHEDULED AUDIO
    // Stop all actively playing or scheduled audio buffers instantly
    for (const source of this.activeSources) {
      try {
        source.onended = null; // Remove listener to avoid state ping-pong
        source.stop();
      } catch (e) {}
    }
    this.activeSources.clear();

    if (this.playbackContext) {
      this.nextPlayTime = this.playbackContext.currentTime;
    }
    this.isPlaying = false;
  }

  private stopMediaStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => {
        t.enabled = false;
        t.stop();
      });
      this.mediaStream = null;
    }
  }

  stop() {
    if (globalActiveSession === this) {
      globalActiveSession = null;
    }
    
    this.isActive = false;
    
    // Disconnect processors immediately
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    this.stopMediaStream();
    
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
      }
      this.audioContext = null;
    }
    
    this.stopPlayback();
    
    if (this.playbackContext) {
      if (this.playbackContext.state !== 'closed') {
        this.playbackContext.close().catch(() => {});
      }
      this.playbackContext = null;
    }
    
    if (this.sessionPromise) {
      const p = this.sessionPromise;
      this.sessionPromise = null;
      p.then((session: any) => {
        if (session && this.sessionConnected) {
          try {
            session.close();
          } catch (e) {
            // Ignore close error
          }
        }
      }).catch(() => {});
    }
    this.sessionConnected = false;
    
    this.updateState("idle");
  }

  sendText(text: string) {
    const lowerText = text.toLowerCase().trim();
    if (lowerText.includes("stop") || lowerText.includes("be quiet") || lowerText.includes("silent") || lowerText.includes("chup ho") || lowerText.includes("shut up") || lowerText.includes("shant")) {
      console.log("Stop command received, halting TTS and Generation instantly.");
      this.stopPlayback();
      this.updateState("listening");
      if (this.sessionPromise) {
        this.sessionPromise.then((session: any) => {
          session.sendRealtimeInput({ text: "SYSTEM_EVENT: User forcefully stopped the generation. Be quiet." });
        });
      }
      return;
    }

    if (!this.isActive) return;
    
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    this.updateState("listening"); // Restart the idle timer
    
    if (this.sessionPromise) {
      this.sessionPromise.then((session: any) => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}

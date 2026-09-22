export async function getApiKey(): Promise<string> {
  // During dev mode, Vite might replace process.env.GEMINI_API_KEY with the actual key or undefined
  try {
    if (typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) {
      const buildKey = process.env.GEMINI_API_KEY;
      if (buildKey !== "undefined" && buildKey.trim() !== "") {
        return buildKey;
      }
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  
  // In production, fetch from server
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("Failed to fetch config");
    const data = await res.json();
    return data.apiKey || "";
  } catch (error) {
    console.error("Error fetching API key:", error);
    return "";
  }
}

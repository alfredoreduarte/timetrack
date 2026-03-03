import Constants from "expo-constants";

// In Expo Go, debuggerHost gives us the dev machine's IP (e.g. "192.168.1.5:8081").
// We extract just the IP and use it to reach the API server.
// For Android emulator, use 10.0.2.2. For physical devices, use the dev machine IP.
const getApiUrl = (): string => {
  const debuggerHost = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const ip = debuggerHost.split(":")[0];
    return `http://${ip}:3011`;
  }
  // Fallback for Android emulator
  return "http://10.0.2.2:3011";
};

export const API_URL = getApiUrl();

export const isElectron = (): boolean => {
  return typeof window !== "undefined" && window.electronAPI !== undefined;
};

export const isBrowser = (): boolean => {
  return !isElectron();
};

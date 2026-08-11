// ── @capacitor/core ───────────────────────────────────────────────────────────
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web' as const,
  isPluginAvailable: (_name: string) => false,
};

// ── @capacitor/status-bar ─────────────────────────────────────────────────────
export const StatusBar = {
  setOverlaysWebView: async () => {},
  setStyle: async () => {},
  setBackgroundColor: async () => {},
  hide: async () => {},
  show: async () => {},
};

export const Style = {
  Dark: 'DARK',
  Light: 'LIGHT',
  Default: 'DEFAULT',
};

// ── BannerAdPosition — kept for AdMobAd / HybridAdComponent type compat ──────
export const BannerAdPosition = {
  TOP_CENTER: 'TOP_CENTER',
  BOTTOM_CENTER: 'BOTTOM_CENTER',
  CENTER: 'CENTER',
};

// ── @capacitor/push-notifications ─────────────────────────────────────────────
export const PushNotifications = {
  requestPermissions: async () => ({ receive: 'denied' }),
  register: async () => {},
  getDeliveredNotifications: async () => ({ notifications: [] }),
  removeAllDeliveredNotifications: async () => {},
  addListener: (_event: string, _handler: any) => Promise.resolve({ remove: () => {} }),
  removeAllListeners: async () => {},
};

// ── @capacitor/app ────────────────────────────────────────────────────────────
export const App = {
  addListener: (_event: string, _handler: any) => Promise.resolve({ remove: () => {} }),
  removeAllListeners: async () => {},
  getInfo: async () => ({ id: '', name: '', build: '', version: '' }),
  getState: async () => ({ isActive: true }),
  getUrl: async () => ({ url: '' }),
  openUrl: async () => ({ completed: false }),
  exitApp: async () => {},
};

// ── @capacitor/device ────────────────────────────────────────────────────────
export const Device = {
  getInfo: async () => ({ platform: 'web', model: '', operatingSystem: 'unknown', osVersion: '', manufacturer: '', isVirtual: false, webViewVersion: '' }),
  getId: async () => ({ identifier: '' }),
  getBatteryInfo: async () => ({ batteryLevel: 1, isCharging: false }),
  getLanguageCode: async () => ({ value: 'en' }),
};

// ── @capacitor/share ──────────────────────────────────────────────────────────
export const Share = {
  share: async () => ({ activityType: '' }),
  canShare: async () => ({ value: false }),
};

// ── @capacitor/network ────────────────────────────────────────────────────────
export const Network = {
  getStatus: async () => ({ connected: true, connectionType: 'wifi' }),
  addListener: (_event: string, _handler: any) => Promise.resolve({ remove: () => {} }),
  removeAllListeners: async () => {},
};

// ── @capacitor/filesystem ────────────────────────────────────────────────────
export const Filesystem = {
  readFile: async () => ({ data: '' }),
  writeFile: async () => ({ uri: '' }),
  deleteFile: async () => {},
  mkdir: async () => {},
  rmdir: async () => {},
  readdir: async () => ({ files: [] }),
  stat: async () => ({ type: 'file', size: 0, ctime: 0, mtime: 0, uri: '', path: '' }),
};

export const Directory = { Documents: 'DOCUMENTS', Data: 'DATA', Cache: 'CACHE', External: 'EXTERNAL', ExternalStorage: 'EXTERNAL_STORAGE' };
export const Encoding = { UTF8: 'utf8', ASCII: 'ascii', UTF16: 'utf16' };

// ── @capgo/capacitor-updater ──────────────────────────────────────────────────
export const CapacitorUpdater = {
  notifyAppReady: async () => {},
  download: async () => ({ version: '' }),
  set: async () => {},
  addListener: (_event: string, _handler: any) => ({ remove: () => {} }),
};

// ── @vercel/analytics/react ───────────────────────────────────────────────────
export const Analytics = () => null;
export const track = () => {};

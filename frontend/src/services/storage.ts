const CORRECTIONS_KEY = 'fuse_corrections_backup';
const PREFERENCES_KEY = 'fuse_user_preferences';
const MAX_CORRECTIONS_STORED = 50;
const LOCAL_STORAGE_TEST_KEY = '__storage_test__';
const BYTES_PER_KB = 1024;
const LOCAL_STORAGE_SIZE_MB = 5;
const BYTES_PER_MB = 1024 * 1024;
const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES_STATS = 1;

export interface CorrectionBackup {
  docId: number;
  timestamp: string;
  corrections: Array<{
    correctionType: 'classification' | 'field';
    originalValue?: string;
    correctedValue: string;
    fieldName?: string;
  }>;
}

export interface UserPreferences {
  autoSaveEnabled: boolean;
  showConfidenceBreakdown: boolean;
  defaultView: 'grid' | 'list';
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoSaveEnabled: true,
  showConfidenceBreakdown: true,
  defaultView: 'grid',
};

function removeCorrectionForDoc(existing: CorrectionBackup[], docId: number): CorrectionBackup[] {
  return existing.filter(c => c.docId !== docId);
}

function trimCorrectionsToLimit(corrections: CorrectionBackup[]): CorrectionBackup[] {
  return corrections.slice(-MAX_CORRECTIONS_STORED);
}

export function saveCorrectionBackup(correction: CorrectionBackup): void {
  try {
    const existing = getCorrectionsBackup();
    const updated = [...removeCorrectionForDoc(existing, correction.docId), correction];
    const trimmed = trimCorrectionsToLimit(updated);
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save correction backup:', error);
  }
}

export function getCorrectionsBackup(): CorrectionBackup[] {
  try {
    const data = localStorage.getItem(CORRECTIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load corrections backup:', error);
    return [];
  }
}

export function getCorrectionForDoc(docId: number): CorrectionBackup | null {
  const corrections = getCorrectionsBackup();
  return corrections.find(c => c.docId === docId) || null;
}

export function clearCorrectionBackup(docId: number): void {
  try {
    const existing = getCorrectionsBackup();
    const updated = removeCorrectionForDoc(existing, docId);
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to clear correction backup:', error);
  }
}

export function clearAllCorrections(): void {
  try {
    localStorage.removeItem(CORRECTIONS_KEY);
  } catch (error) {
    console.error('Failed to clear all corrections:', error);
  }
}

export function savePreferences(preferences: Partial<UserPreferences>): void {
  try {
    const existing = getPreferences();
    const updated = { ...existing, ...preferences };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

export function getPreferences(): UserPreferences {
  try {
    const data = localStorage.getItem(PREFERENCES_KEY);
    return data ? { ...DEFAULT_PREFERENCES, ...JSON.parse(data) } : DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

export function isLocalStorageAvailable(): boolean {
  try {
    localStorage.setItem(LOCAL_STORAGE_TEST_KEY, LOCAL_STORAGE_TEST_KEY);
    localStorage.removeItem(LOCAL_STORAGE_TEST_KEY);
    return true;
  } catch {
    return false;
  }
}

function calculateStorageUsed(): number {
  let used = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      used += localStorage[key].length + key.length;
    }
  }
  return used;
}

function convertBytesToKB(bytes: number): number {
  return Math.round(bytes / BYTES_PER_KB);
}

function calculateStoragePercentage(used: number, available: number): number {
  const percentage = (used / available) * PERCENTAGE_MULTIPLIER;
  return Math.round(percentage * Math.pow(10, DECIMAL_PLACES_STATS)) / Math.pow(10, DECIMAL_PLACES_STATS);
}

export function getStorageStats(): { used: number; available: number; percentage: number } {
  try {
    const used = calculateStorageUsed();
    const available = LOCAL_STORAGE_SIZE_MB * BYTES_PER_MB;
    const percentage = calculateStoragePercentage(used, available);

    return {
      used: convertBytesToKB(used),
      available: convertBytesToKB(available),
      percentage,
    };
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return { used: 0, available: 0, percentage: 0 };
  }
}

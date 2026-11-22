import { DEFAULT_ENS_SYSTEM, isDefaultSystem, isValidSystemId } from './systems';

const STORAGE_KEY = 'powerEns.system';

const stored = (): string => {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY) || '';
    return isValidSystemId(value) ? value : DEFAULT_ENS_SYSTEM;
  } catch {
    return DEFAULT_ENS_SYSTEM;
  }
};

let selected = stored();

export const getSelectedSystem = (): string => selected;

// The configuration, the scope and every evaluation read are loaded once per system, so the
// caller reloads the page after a change instead of patching each cache.
export const selectSystem = (system: string): void => {
  selected = isValidSystemId(system) ? system : DEFAULT_ENS_SYSTEM;
  try {
    if (isDefaultSystem(selected)) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, selected);
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
};

export const systemQuery = (): Record<string, string> => (isDefaultSystem(selected) ? {} : { system: selected });

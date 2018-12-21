import { isAbsolute, join } from 'path';
import { getDefaultDatadir } from './default';
import { SECTION_NAMES, BITCOIN_CONFIG_OPTIONS } from './constants';

export const toAbsolute = (filePath: string, datadir?: string) => {
  if (isAbsolute(filePath)) {
    return filePath;
  }
  if (datadir && !isAbsolute(datadir)) {
    throw new Error('Path "datadir" must be absolute');
  }
  return join(datadir || getDefaultDatadir(), filePath);
};

export const findOption = (
  maybeOptionName: string,
  sectionName?: (typeof SECTION_NAMES)[number],
) => {
  const found = Object.entries(BITCOIN_CONFIG_OPTIONS).find(
    ([optionName]) => optionName === maybeOptionName,
  );
  if (!found) {
    throw new Error(`Unknown option name "${maybeOptionName}"`);
  }
  const optionName = maybeOptionName as keyof typeof BITCOIN_CONFIG_OPTIONS;
  const [, option] = found;
  if (sectionName) {
    if (option.onlyAllowedInTop) {
      throw new Error(`Option "${optionName} must be at the top level`);
    }
    if (sectionName === 'main' && option.notAllowedInMain) {
      throw new Error(`Option "${optionName}" is not allowed in "main" section`);
    }
  }
  return {
    optionName,
    option,
  };
};

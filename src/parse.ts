import { mergeBitcoinConfigs } from './merge';
import { OPTIONS } from './options';
import { BitcoinConfigKey, BitcoinConfig } from './config';

// const getNetworkSectionTypeName = getRType(SECTION_OPTIONS);
// const getTopSectionRType = getRType(TOP_OPTIONS);

export const findOptionByName = (maybeOptionName: string) => {
  const found = Object.entries(OPTIONS).find(
    ([optionName]) => optionName === maybeOptionName,
  );
  if (!found) {
    throw new Error(`Unknown option name "${maybeOptionName}"`);
  }
  const [, option] = found;
  return option;
};

const createParseLine = (context: BitcoinConfigKey) => (line: string): BitcoinConfig => {
  const indexOfEqualsSign = line.indexOf('=');
  if (indexOfEqualsSign === -1) {
    throw new Error('Expected "name = value"');
  }
  const lhs = line.slice(0, indexOfEqualsSign).trim();
  if (lhs.length === 0) {
    throw new Error('Empty option name');
  }
  const rhs = line.slice(indexOfEqualsSign + 1).trim();
  if (context === 'top') {
    const indexOfDot = lhs.indexOf('.');
    if (indexOfDot > -1) {
      // context === 'top' && indexOfDot > -1
      const sectionName = castToSectionName(lhs.slice(0, indexOfDot));
      const optionName = lhs.slice(indexOfDot + 1);
      const typeName = getNetworkSectionTypeName(optionName);
      return { [sectionName]: { [optionName]: castTo(typeName)(rhs) } };
    }
    // context === 'top' && indexOfDot === -1
    const optionName = lhs;
    const typeName = getTopSectionRType(lhs);
    return {
      [context]: { [optionName]: castTo(typeName)(rhs) },
    };
  }
  // sectionName !== 'top'
  const optionName = lhs;
  const typeName = getNetworkSectionTypeName(optionName);
  return {
    [context]: { [optionName]: castTo(typeName)(rhs) },
  };
};

// Similar to Bitcoin's GetConfigOptions
export const parseBitcoinConf = (str: string) => {
  let bitcoinConfig: BitcoinConfig = {};
  let parseLine = createParseLine('top');
  str.split('\n').forEach((originalLine, index) => {
    try {
      let line = originalLine;

      // Remove comments
      const indexOfPoundSign = line.indexOf('#');
      if (indexOfPoundSign > -1) {
        line = line.slice(0, indexOfPoundSign);
      }

      // Trim whitespace
      line = line.trim();

      if (line.length === 0) {
        return;
      }

      // [main/test/regtest] https://bitcoincore.org/en/releases/0.17.0/#configuration-sections-for-testnet-and-regtest
      if (line.startsWith('[') && line.endsWith(']')) {
        const sectionName = castToSectionName(line.slice(1, -1));
        parseLine = createParseLine(sectionName);
        return;
      }

      // name = value
      bitcoinConfig = mergeBitcoinConfigs(bitcoinConfig, parseLine(line));
    } catch (ex) {
      throw new Error(`Parse error: ${ex.message}: line ${index + 1}: ${originalLine}`);
    }
  });
  return bitcoinConfig;
};

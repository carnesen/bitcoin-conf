import { BitcoinConfig, readConfigFiles, writeConfigFiles } from '..';
import { isAbsolute, dirname, basename, join } from 'path';
import tempWrite = require('temp-write');
import * as tempy from 'tempy';
import { readFileSync, existsSync } from 'fs';

// throws-invalid-option-name.conf
describe('readConfigFiles', () => {
  it('reads bitcoin.conf in the default datadir if no arg is provided', () => {
    try {
      // This will succeed if you have a parsable bitcoin.conf in your default datadir.
      // If your default datadir does not exist, it will throw ENOENT, which is expected.
      readConfigFiles();
    } catch (ex) {
      if (ex.code !== 'ENOENT') {
        throw ex;
      }
    }
  });

  it('reads bitcoin.conf in the specified datadir', () => {
    const filePath = tempWrite.sync('rpcuser=chris', 'bitcoin.conf');
    const datadir = dirname(filePath);
    expect(readConfigFiles({ datadir })).toEqual({ rpcuser: 'chris' });
  });

  it('returns an empty object if specified datadir has no bitcoin.conf', () => {
    expect(readConfigFiles({ datadir: __dirname })).toEqual({});
  });

  it('interprets non-absolute "conf" as relative to datadir', () => {
    const filePath = tempWrite.sync('rpcuser=carl');
    expect(
      readConfigFiles({ datadir: dirname(filePath), conf: basename(filePath) }),
    ).toEqual({ rpcuser: 'carl' });
  });

  it('ignores datadir and just reads "conf" if it\'s an absolute path', () => {
    const filePath = tempWrite.sync('rpcuser=susan');
    const datadir = 'this value is ignored if conf is absolute';
    expect(isAbsolute(filePath)).toBe(true);
    expect(readConfigFiles({ datadir, conf: filePath })).toEqual({ rpcuser: 'susan' });
  });

  it('reads and merges in all "includeconf" files', () => {
    const includedFilePath = tempWrite.sync('rpcuser=satoshi');
    const entryFilePath = tempWrite.sync(`includeconf=${includedFilePath}`);
    const config = readConfigFiles({ conf: entryFilePath });
    expect(config).toEqual({ includeconf: [includedFilePath], rpcuser: 'satoshi' });
  });

  it('attaches an unknown option as a string but does not include it in the static type', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('foo=bar') });
    expect((config as any).foo).toEqual('bar');
    // In the above line ^^, we have to use a type assertion "as any"
    // because the static type of "config" doesn't know about "foo".
    // The following would be a type error:
    //   expect(config.foo).toBe('bar');
  });

  it('ignores spaces around keys', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('rpcuser  =  foo') });
    expect(config.rpcuser === 'foo').toEqual(true);
  });

  it('attaches a value of a "string" option as a string', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('rpcuser=foo') });
    expect(config.rpcuser === 'foo').toEqual(true);
  });

  it('attaches a value of a "string[]" option as a string array', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('rpcauth=foo') });
    expect(config.rpcauth![0] === 'foo').toEqual(true);
  });

  it('attaches a value of a "number" option as a number', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('rpcport=12345') });
    expect(config.rpcport === 12345).toEqual(true);
  });

  it('attaches a value "1" of a "boolean" option as true', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('blocksonly=1') });
    expect(config).toEqual({ blocksonly: true });
  });

  it('attaches a value "0" of a "boolean" option as false', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('blocksonly=0') });
    expect(config).toEqual({ blocksonly: false });
  });

  it('attaches an undefined value of a "boolean" option as false', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('blocksonly=') });
    expect(config).toEqual({ blocksonly: false });
  });

  it('attaches a truthy value that\'s not "1" of a "boolean" option as false', () => {
    const config = readConfigFiles({ conf: tempWrite.sync('blocksonly=true') });
    expect(config).toEqual({ blocksonly: false });
  });

  it('takes only the first value if the option has typeName "string"', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('rpcuser=foo \n rpcuser=bar'),
    });
    expect(config).toEqual({ rpcuser: 'foo' });
  });

  it('takes only the first value if the option has typeName "number"', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('rpcport=12345 \n rpcport=55555'),
    });
    expect(config).toEqual({ rpcport: 12345 });
  });

  it('takes only the first value if the option has typeName "boolean"', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('blocksonly=1 \n blocksonly=0'),
    });
    expect(config).toEqual({ blocksonly: true });
  });

  it('appends additional values if the option has typeName "string[]"', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('rpcauth=foo \n rpcauth=bar'),
    });
    expect(config).toEqual({ rpcauth: ['foo', 'bar'] });
  });

  it('gets values from the "main" section if not in regtest or test mode', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('[main] \n rpcuser=lisa'),
    });
    expect(config).toEqual({ rpcuser: 'lisa' });
  });

  it('ignores values from non-"main" sections if not in regtest or test mode', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('[regtest] \n rpcuser=lisa'),
    });
    expect(config).toEqual({});
  });

  it('takes values from "regtest" section too if regtest is set to true in top', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('regtest=1 \n [regtest] \n rpcuser=gwen'),
    });
    expect(config).toEqual({ regtest: true, rpcuser: 'gwen' });
  });

  it('takes values from "test" section too if testnet is set to true in top', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('testnet=1 \n [test] \n rpcuser=gail'),
    });
    expect(config).toEqual({ testnet: true, rpcuser: 'gail' });
  });

  it('does not attach "onlyAppliesToMain" options in top if selected network is not "main"', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('testnet=1 \n rpcport=12345'),
    });
    expect(config).toEqual({ testnet: true });
  });

  it('allows user to specify network using dot notation in top section', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync('testnet=1 \n main.rpcuser=jim \n test.rpcpassword=123'),
    });
    expect(config).toEqual({ testnet: true, rpcpassword: '123' });
  });

  it('includes default values if options include withDefaults=true', () => {
    const config = readConfigFiles({
      conf: tempWrite.sync(''),
      withDefaults: true,
    });
    expect(config.blocksonly).toBe(false);
  });

  it('includes proper network-dependent default values where appropriate', () => {
    expect(
      readConfigFiles({
        conf: tempWrite.sync(''),
        withDefaults: true,
      }).rpcport,
    ).toBe(8332);
    expect(
      readConfigFiles({
        conf: tempWrite.sync('testnet=1'),
        withDefaults: true,
      }).rpcport,
    ).toBe(18332);
  });

  it('throws "Parse error" with the line number and line text if a line is bad', () => {
    expect(() => {
      readConfigFiles({
        conf: tempWrite.sync('\n\n foo bar baz'),
      });
    }).toThrow(/Parse error:.*line 3:  foo bar baz/);
  });

  it('throws "regtest and testnet" error if both are set to true', () => {
    expect(() =>
      readConfigFiles({
        conf: tempWrite.sync('regtest=1 \n testnet=1'),
      }),
    ).toThrow('regtest and testnet');
  });

  it('throws "Expected...main,regtest,test" if it contains a bad section name', () => {
    expect(() =>
      readConfigFiles({
        conf: tempWrite.sync('[foo]'),
      }),
    ).toThrow(/Expected.*main,regtest,test/);
  });

  it('throws "empty option name" if a line has an empty option name', () => {
    expect(() =>
      readConfigFiles({
        conf: tempWrite.sync('=foo'),
      }),
    ).toThrow('Empty option name');
  });

  it('throws "not allowed to have includeconf" if an included conf has an includeconf', () => {
    const includedFilePath = tempWrite.sync('includeconf=anything.conf');
    const entryFilePath = tempWrite.sync(`includeconf=${includedFilePath}`);
    expect(() => readConfigFiles({ conf: entryFilePath })).toThrow(
      'not allowed to have includeconf',
    );
  });

  it('throws "not allowed" if an option appears in a section in which it is not allowed', () => {
    expect(() =>
      readConfigFiles({
        conf: tempWrite.sync('[main] \n vbparams=foo'),
      }),
    ).toThrow('not allowed');
  });

  it('throws "must be absolute" if passed datadir is not absolute', () => {
    expect(() =>
      readConfigFiles({
        datadir: 'foo',
      }),
    ).toThrow('must be absolute');
  });

  it('throws "only allowed in top" if an option uses dot notation in a network section', () => {
    expect(() =>
      readConfigFiles({
        conf: tempWrite.sync('[main] \n test.rpcuser=don'),
      }),
    ).toThrow('only allowed in top');
  });

  it('throws "rpcpassword option ... comments" if rpcpassword line has a comment', () => {
    expect(() =>
      readConfigFiles({
        conf: tempWrite.sync('rpcpassword=foo # comment is not allowed on this line'),
      }),
    ).toThrow(/rpcpassword option.*comments/);
  });

  it('throws ENOENT if conf is passed but does not exist', () => {
    expect(() =>
      readConfigFiles({
        conf: tempy.file(),
      }),
    ).toThrow('ENOENT');
  });
});

describe('writeConfigFiles', () => {
  it('writes bitcoin.conf in the specified datadir', () => {
    const datadir = tempy.directory();
    writeConfigFiles({}, { datadir });
    expect(existsSync(join(datadir, 'bitcoin.conf'))).toBe(true);
  });

  it('writes file to "conf" if that option is provided as an absolute path', () => {
    const conf = tempy.file();
    writeConfigFiles({}, { conf });
    expect(existsSync(conf)).toBe(true);
  });

  it('ignores datadir if conf is provided as an absolute path', () => {
    const conf = tempy.file();
    expect(isAbsolute(conf)).toBe(true);
    const datadir = 'this value is completely ignored if conf is absolute';
    writeConfigFiles({}, { conf, datadir });
    expect(existsSync(conf)).toBe(true);
  });

  it('interprets "conf" as datadir-relative if it is not an absolute path', () => {
    const datadir = tempy.directory();
    const conf = 'non-standard-filename.conf';
    writeConfigFiles({}, { datadir, conf });
    expect(existsSync(join(datadir, conf))).toBe(true);
  });

  it('throws "ENOENT" if specified datadir does not exist', () => {
    const datadir = tempy.file();
    // ^^ tempy.file() is basically just tempy.directory() without the mkdir
    expect(() => writeConfigFiles({}, { datadir })).toThrow('ENOENT');
  });

  it('throws "ENOENT" if conf is provided in a directory that does not already exist', () => {
    const conf = join(tempy.file(), 'some-filename.conf');
    // ^^ tempy.file() is basically just tempy.directory() without the mkdir
    expect(() => writeConfigFiles({}, { datadir: conf })).toThrow('ENOENT');
  });

  it('creates a backup of an existing file first if one exists', () => {
    const conf = tempy.file();
    writeConfigFiles({ rpcuser: 'foo' }, { conf });
    const fileContents = readFileSync(conf, 'utf8');
    writeConfigFiles({ rpcuser: 'bar' }, { conf });
    const backupFileContents = readFileSync(`${conf}.bak`, 'utf8');
    expect(fileContents).toBe(backupFileContents);
  });

  it('returns an array of the file paths and contents that were written', () => {
    const filePath = tempy.file();
    const returnValue = writeConfigFiles({ rpcuser: 'foo' }, { conf: filePath });
    const fileContents = readFileSync(filePath, 'utf8');
    expect(returnValue).toEqual([{ filePath, fileContents }]);
  });

  it('writes a header comment line', () => {
    const [{ fileContents }] = writeConfigFiles({}, { conf: tempy.file() });
    expect(fileContents).toMatch(/^# .* written by/);
  });

  it('writes string option as name=value', () => {
    const [{ fileContents }] = writeConfigFiles(
      { rpcuser: 'sinh' },
      { conf: tempy.file() },
    );
    expect(fileContents).toMatch(/^rpcuser=sinh$/m);
  });
  it('writes multi-valued string option as multiple name=value pairs', () => {
    const [{ fileContents }] = writeConfigFiles(
      { rpcauth: ['foo', 'bar'] },
      { conf: tempy.file() },
    );
    expect(fileContents).toMatch(/^rpcauth=foo\n\r?rpcauth=bar$/m);
  });
});

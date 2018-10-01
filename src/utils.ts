import { TextDocumentContentProvider, Uri, window } from 'vscode'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import * as WabtModule from 'wabt'

// @ts-ignore
const wabt = WabtModule();

/**
 * @param uri - path to the file.
 */
export function getPhysicalPath(uri: Uri): string {
  if (uri.scheme === 'wasm-preview') {
      return uri.with({ scheme: 'file' }).fsPath
  }

  return uri.fsPath;
}

export function readFile(uri: Uri): Promise<Buffer> {
  const filepath = getPhysicalPath(uri);

  return new Promise((resolve, reject) => {
    fs.readFile(filepath, { encoding: null }, (err: Error, data: Buffer) => {
      if (err) {
        return reject(err)
      }

      resolve(data)
    })
  })
}

export function readWasm(uri: Uri): Promise<Buffer | undefined> {
  if (uri.scheme !== 'wasm-preview') {
    return
  }

  return readFile(uri)
}

export function writeFile(uri: Uri, content: Buffer | string): Promise<void> {
  const filepath = getPhysicalPath(uri);

  return new Promise((resolve, reject) => {
    fs.writeFile(filepath, content, (err: Error) => {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}

export function wasm2wat(content: Buffer): string {
  let wasmModule

  try {
    wasmModule = wabt.readWasm(content, { readDebugNames: true })
    wasmModule.generateNames()
    wasmModule.resolveNames()
    wasmModule.applyNames()

    return wasmModule.toText({ foldExprs: false, inlineExport: false });
  } catch(err) {
    window.showErrorMessage(err.message)
  } finally {
    if (wasmModule === undefined) {
      return
    }

    wasmModule.destroy()
  }
}

export function wat2wasm(content: Buffer): Buffer {
  let wasmModule

  try {
    wasmModule = wabt.parseWat('temp.wat', content)
    wasmModule.resolveNames()

    const binaryResult = wasmModule.toBinary({ log: false, write_debug_names: true })
    return Buffer.from(binaryResult.buffer.buffer)
  } catch(err) {
    window.showErrorMessage(err.message)
  } finally {
    if (wasmModule === undefined) {
      return
    }

    wasmModule.destroy()
  }
}

export class SubscribeComplete extends EventEmitter {
  private _events: Array<any>;
  private _handle : NodeJS.Timer;
  private _time: number;
  private _complete: boolean;

  constructor(time: number) {
    super();

    this._events = [];
    this._time = time;
    this._complete = false;

    this.resetTimer();
  }

  private resetTimer() {
    if (this._handle !== undefined) {
      clearTimeout(this._handle);
    }

    this._handle = setTimeout(() => {
      this._complete = true;
      this.emit('complete', this._events);
    }, this._time);
  }

  process(event): boolean {
    if (this._complete) {
      return false
    }

    this._events.push(event);
    this.resetTimer();

    return true;
  }

  dispose() {
    this._events.length = 0;
    this._handle = undefined;
  }
}

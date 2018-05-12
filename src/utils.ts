import { TextDocumentContentProvider, Uri, window } from 'vscode'
import * as fs from 'fs'
import * as wabt from 'wabt'

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
    fs.readFile(filepath, (err: Error, data: Buffer) => {
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

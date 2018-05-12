import { TextDocumentContentProvider, Uri, window } from 'vscode'
import * as fs from 'fs'
import { decode } from "@webassemblyjs/wasm-parser";
import { print } from "@webassemblyjs/wast-printer"

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
  return print(decode(content))
}
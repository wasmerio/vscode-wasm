'use strict';

import { TextDocumentContentProvider, Uri, window } from 'vscode'
import * as fs from 'fs'
import { decode } from "@webassemblyjs/wasm-parser";
import { print } from "@webassemblyjs/wast-printer"

const scheme = 'WebAssembly'

/**
 * This class helps to open WebAssembly binary files.
 */
export default class WebAssemblyContentProvider implements TextDocumentContentProvider {

  public async provideTextDocumentContent(uri: Uri): Promise<string | undefined> {
    const buffer = await readFile(uri)

    if (!buffer) {
      return
    }

    return print(decode(buffer))
  }
}

/**
 * @param uri - path to the file.
 */
function getPhysicalPath(uri: Uri): string {
  if (uri.scheme === scheme) {
      return uri.with({ scheme: 'file' }).fsPath
  }

  return uri.fsPath;
}

function readFile(uri: Uri): Promise<Buffer | undefined> {
  if (uri.scheme !== scheme) {
    return
  }

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
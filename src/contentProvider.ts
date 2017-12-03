'use strict';

import { TextDocumentContentProvider, Uri, window } from 'vscode'
import * as fs from 'fs'

const wabt = require('../third_party/libwabt')
const scheme = 'WebAssembly'

/**
 * This class helps to open WebAssembly binary files.
 */
export default class WebAssemblyContentProvider implements TextDocumentContentProvider {

  public async provideTextDocumentContent(uri: Uri): Promise<string | undefined> {
    const buffer = await readFile(uri)
    let wmodule
    
    if (!buffer) {
      return
    }
    
    try {
      wmodule = wabt.readWasm(buffer, {readDebugNames: false})
      
      wmodule.generateNames()
      wmodule.applyNames()
      
      return wmodule.toText({foldExprs: false, inlineExport: false})
    } catch(err) {
      throw err;
    } finally {
      if (wmodule) {

        // TODO: rebuild libwabt.js
        if (!wmodule.lexer) {
          wmodule.lexer = {
            destroy() {}
          }
        }
        wmodule.destroy()
      }
    }
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
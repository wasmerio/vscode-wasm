'use strict';

import { TextDocumentContentProvider, Uri, window } from 'vscode'
import { wasm2wat, readWasm } from './utils'

/**
 * This class helps to open WebAssembly binary files.
 */
export default class WebAssemblyContentProvider implements TextDocumentContentProvider {
  public async provideTextDocumentContent(uri: Uri): Promise<string | undefined> {
    const buffer = await readWasm(uri)

    if (!buffer) {
      return
    }

    return wasm2wat(buffer)
  }
}

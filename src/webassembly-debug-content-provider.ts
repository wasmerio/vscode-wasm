'use strict';

import { TextDocumentContentProvider, Uri, window, workspace } from 'vscode'

const namespace = 'wasm-debug'

/**
 * This class helps to open WebAssembly files.
 */
export default class WebAssemblyDebugContentProvider implements TextDocumentContentProvider {
  public async provideTextDocumentContent(uri: Uri): Promise<string | undefined> {
    const filepath = uri.path.replace(/\.was?t$/, '')
    const file = uri.with({ scheme: 'debug', path: filepath })

    const document = await workspace.openTextDocument(file)

    return document.getText()
  }
}

'use strict';

import * as vscode from 'vscode'

import WebAssemblyContentProvider from './webassembly-content-provider'
import WebAssemblyDebugContentProvider from './webassembly-debug-content-provider';
import { Uri } from 'vscode'
import { wasm2wat, wat2wasm, writeFile, readFile, SubscribeComplete } from './utils'
import WebAssemblyFunctionQuickPickItem from './webassembly-quick-pick-item';
import WebAssemblyDebugSession from './webassembly-debug-session';

const wasmNamespace = '<node_internals>/wasm:'
const WasmFuncPickItem = WebAssemblyFunctionQuickPickItem;

let activeDebugSession : WebAssemblyDebugSession | null = null

export function activate(context: vscode.ExtensionContext) {
  const provider = new WebAssemblyContentProvider()
  const debugProvider = new WebAssemblyDebugContentProvider()

  const registration = vscode.workspace.registerTextDocumentContentProvider('wasm-preview', provider)
  const registerDebug = vscode.workspace.registerTextDocumentContentProvider('wasm-debug', debugProvider)

  const openEvent = vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
    showDocument(document);
  });

  const previewCommand = vscode.commands.registerCommand('wasm.wasm2wat', (uri: Uri) => {
    showPreview(uri)
  })

  const save2watCommand = vscode.commands.registerCommand('wasm.save2wat', (uri: Uri) => {
    const watPath = uri.path.replace(/\.wasm$/, '.wat')

    const saveDialogOptions = {
      filters: {
        'WebAssembly Text': ['wat', 'wast'],
        'WebAssembly Binary': ['wasm']
      },
      defaultUri: uri.with({ scheme: 'file', path: watPath })
    }

    const from = uri.with({ scheme: 'file' })

    vscode.window.showSaveDialog(saveDialogOptions)
      .then(maybeSaveWat(from), vscode.window.showErrorMessage)
  })

  const save2wasmCommand = vscode.commands.registerCommand('wasm.save2wasm', (uri: Uri) => {
    const wasmPath = uri.path.replace(/\.wat$/, '.wasm')

    const saveDialogOptions = {
      filters: {
        'WebAssembly Binary': ['wasm'],
        'WebAssembly Text': ['wat', 'wast']
      },
      defaultUri: uri.with({ scheme: 'file', path: wasmPath })
    }

    const from = uri.with({ scheme: 'file' })

    vscode.window.showSaveDialog(saveDialogOptions)
      .then(maybeSaveWasm(from), vscode.window.showErrorMessage)
  })

  const pickFunction = vscode.commands.registerCommand('wasm.pickFunction', () => {
    const sources = activeDebugSession ? activeDebugSession.sources : []

    async function select(file: WebAssemblyFunctionQuickPickItem | undefined) {
      if (!file || !activeDebugSession) {
        return
      }

      return activeDebugSession.openFile(file.source)
    }

    const options = { placeHolder: "Pick a function..." };

    vscode.window.showQuickPick(sources.map(source => new WasmFuncPickItem(source)), options)
      .then(select, vscode.window.showErrorMessage)
  });

  if (vscode.window.activeTextEditor) {
    showDocument(vscode.window.activeTextEditor.document);
  }

  const startDebugEvent = vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
    if (!isNodeDebugSession(session)) {
      return
    }

    activeDebugSession = new WebAssemblyDebugSession(session);

    activeDebugSession.once('wasm:sources', (sources) => {
      console.log('Complete loadind sources, length=%s', sources.length);
    })

    activeDebugSession.on('error', (error) => console.error(error))

    context.subscriptions.push(activeDebugSession);
  })

  context.subscriptions.push(
    registration,
    registerDebug,
    openEvent,
    previewCommand,
    save2watCommand,
    save2wasmCommand,
    startDebugEvent,
    pickFunction
  )
}

export function deactivate() {
  activeDebugSession = null
}

function showDocument(document: vscode.TextDocument): void {
  if (document.languageId === "wasm" && document.uri.scheme !== "wasm-preview") {
    vscode.commands.executeCommand("workbench.action.closeActiveEditor").then(() => {
      showPreview(document.uri);
    }, vscode.window.showErrorMessage);
  }
}

function showPreview(uri: vscode.Uri): void {
  if (uri.scheme === "wasm-preview") {
    return
  }

  vscode.commands.executeCommand('vscode.open', uri.with({ scheme: 'wasm-preview' }))
    .then(null, vscode.window.showErrorMessage);
}

function maybeSaveWat(from: vscode.Uri) {
  return (to: vscode.Uri | undefined) => {
    if (!to) {
      return
    }

    return saveWat(from, to)
  }
}

async function saveWat(from: vscode.Uri, to: vscode.Uri) {
  const wasmContent = await readFile(from)
  const watContent = wasm2wat(wasmContent)

  await writeFile(to, watContent)
}

function maybeSaveWasm(from: vscode.Uri) {
  return (to: vscode.Uri | undefined) => {
    if (!to) {
      return
    }

    return saveWasm(from, to)
  }
}

async function saveWasm(from: vscode.Uri, to: vscode.Uri) {
  const watContent = await readFile(from)
  const wasmContent = wat2wasm(watContent)

  await writeFile(to, wasmContent)
}

function isNodeDebugSession(session: vscode.DebugSession | undefined) {
  if (session === undefined) {
    return false
  }

  if (!session.type.startsWith('node')) {
    return false
  }

  return true
}

function isWebAssemblyDocument(document: vscode.TextDocument) {
  return document.fileName.startsWith(wasmNamespace)
}

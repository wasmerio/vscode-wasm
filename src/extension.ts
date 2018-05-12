'use strict';

import * as vscode from 'vscode'

import WebAssemblyContentProvider from './webassembly-content-provider'
import { Uri } from 'vscode'
import { wasm2wat, writeFile, readFile } from './utils'

const wasmScheme = 'wasm'

export function activate(context: vscode.ExtensionContext) {
    const provider = new WebAssemblyContentProvider()
    const registration = vscode.workspace.registerTextDocumentContentProvider('wasm-preview', provider)
    
    const openEvent = vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
        showDocument(document);
    });

    const previewCommand = vscode.commands.registerCommand('wasm.wasm2wat', (uri: Uri) => {
        showPreview(uri)
    })
    
    const save2watCommand = vscode.commands.registerCommand('wasm.save2wat', (uri: Uri) => {
        if (!uri) {
            return
        }

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

    if (vscode.window.activeTextEditor) {
        showDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(registration, openEvent, previewCommand, save2watCommand)
}

export function deactivate() {
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
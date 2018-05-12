'use strict';

import * as vscode from 'vscode'

import WebAssemblyContentProvider from './webassembly-content-provider'
import { Uri } from 'vscode'

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

    if (vscode.window.activeTextEditor) {
        showDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(registration, openEvent, previewCommand)
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

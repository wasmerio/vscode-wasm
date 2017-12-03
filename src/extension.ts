'use strict';

import * as vscode from 'vscode'

import WebAssemblyContentProvider from './contentProvider'
import { Uri } from 'vscode'

const defaultScheme = 'WebAssembly'

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('wasm.wasm2wat', (file: Uri) => {
        if (file.scheme === 'file') {
            vscode.commands.executeCommand('vscode.open', file.with({ scheme: defaultScheme }))
        }
    }))

    const provider = new WebAssemblyContentProvider()
    const registration = vscode.workspace.registerTextDocumentContentProvider(defaultScheme, provider)
    
    context.subscriptions.push(registration)
}

export function deactivate() {
}

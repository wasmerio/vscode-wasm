"use strict";

import {
  ExtensionContext,
  TextDocument,
  commands,
  Uri,
  window,
  workspace,
} from "vscode";

import {
  Disposable,
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

import WebAssemblyContentProvider from "./webassembly-content-provider";
import { wasm2wat, wat2wasm, writeFile, readFile } from "./utils";

let client: LanguageClient;
// type a = Parameters<>;

async function activateWAILsp(context: ExtensionContext) {
  context.globalState.update("inWaiFile", true);

  const traceOutputChannel = window.createOutputChannel(
    "WAI Language Server trace"
  );
  const command = process.env.SERVER_PATH || "wai-language-server";
  const run: Executable = {
    command,
    options: {
      env: {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        RUST_LOG: "debug",
      },
    },
  };
  const serverOptions: ServerOptions = {
    run,
    debug: run,
  };

  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "wai" }],
    traceOutputChannel,
  };

  client = new LanguageClient(
    "wai-language-server",
    "WAI Language Server",
    serverOptions,
    clientOptions
  );
  client.start();
}

export function activate(context: ExtensionContext) {
  // starting the language server for WAI
  activateWAILsp(context);

  const provider = new WebAssemblyContentProvider();

  const registration = workspace.registerTextDocumentContentProvider(
    "wasm-preview",
    provider
  );

  const openEvent = workspace.onDidOpenTextDocument(
    (document: TextDocument) => {
      showDocument(document);
    }
  );

  const previewCommand = commands.registerCommand(
    "wasm.wasm2wat",
    (uri: Uri) => {
      showPreview(uri);
    }
  );

  const save2watCommand = commands.registerCommand(
    "wasm.save2wat",
    (uri: Uri) => {
      const watPath = uri.path.replace(/\.wasm$/, ".wat");

      const saveDialogOptions = {
        filters: {
          "WebAssembly Text": ["wat", "wast"],
          "WebAssembly Binary": ["wasm"],
        },
        defaultUri: uri.with({ scheme: "file", path: watPath }),
      };

      const from = uri.with({ scheme: "file" });

      window
        .showSaveDialog(saveDialogOptions)
        .then(maybeSaveWat(from), window.showErrorMessage);
    }
  );

  const save2wasmCommand = commands.registerCommand(
    "wasm.save2wasm",
    (uri: Uri) => {
      const wasmPath = uri.path.replace(/\.wat$/, ".wasm");

      const saveDialogOptions = {
        filters: {
          "WebAssembly Binary": ["wasm"],
          "WebAssembly Text": ["wat", "wast"],
        },
        defaultUri: uri.with({ scheme: "file", path: wasmPath }),
      };

      const from = uri.with({ scheme: "file" });

      window
        .showSaveDialog(saveDialogOptions)
        .then(maybeSaveWasm(from), window.showErrorMessage);
    }
  );

  if (window.activeTextEditor) {
    showDocument(window.activeTextEditor.document);
  }

  context.subscriptions.push(
    registration,
    openEvent,
    previewCommand,
    save2watCommand,
    save2wasmCommand
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function showDocument(document: TextDocument): void {
  if (
    document.languageId === "wasm" &&
    document.uri.scheme !== "wasm-preview"
  ) {
    commands.executeCommand("workbench.action.closeActiveEditor").then(() => {
      showPreview(document.uri);
    }, window.showErrorMessage);
  }
}

function showPreview(uri: Uri): void {
  if (uri.scheme === "wasm-preview") {
    return;
  }

  commands
    .executeCommand("vscode.open", uri.with({ scheme: "wasm-preview" }))
    .then(null, window.showErrorMessage);
}

function maybeSaveWat(from: Uri) {
  return (to: Uri | undefined) => {
    if (!to) {
      return;
    }

    return saveWat(from, to);
  };
}

async function saveWat(from: Uri, to: Uri) {
  const wasmContent = await readFile(from);
  const watContent = await wasm2wat(wasmContent);

  await writeFile(to, watContent);
}

function maybeSaveWasm(from: Uri) {
  return (to: Uri | undefined) => {
    if (!to) {
      return;
    }

    return saveWasm(from, to);
  };
}

async function saveWasm(from: Uri, to: Uri) {
  const watContent = await readFile(from);
  const wasmContent = await wat2wasm(watContent);

  await writeFile(to, wasmContent);
}

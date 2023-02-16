"use strict";

import {
  ExtensionContext,
  TextDocument,
  commands,
  Uri,
  window,
  workspace,
  QuickPickOptions,
} from "vscode";

import {
  Disposable,
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  URI,
} from "vscode-languageclient/node";

import WebAssemblyContentProvider from "./webassembly-content-provider";
import { wasm2wat, wat2wasm, writeFile, readFile } from "./utils";
import { QuickPickItem } from "vscode";

let client: LanguageClient;
// type a = Parameters<>;

interface WaiFile {
  fileName: string;
  fileContent: Uint8Array;
}

enum BindingLanguage {
  Rust = "Rust",
  JavaScript = "JavaScript",
  Python = "Python",
  C = "C",
}

enum GenerationDirection {
  Guest = "Guest",
  Host = "Host",
}

enum GenerationType {
  Import = "Import",
  Export = "Export",
}

async function activateWAILsp(context: ExtensionContext) {
  context.globalState.update("inWaiFile", true);

  const traceOutputChannel = window.createOutputChannel(
    "WAI Language Server trace"
  );
  const command =
    process.env.SERVER_PATH ||
    workspace.getConfiguration("wai-language-server").get("serverPath");

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

  client.onRequest(
    "wai/saveFile",
    async ({ fileName, fileContent }: WaiFile) => {
      // get the current path of root folder
      const rootPath = workspace.workspaceFolders?.[0].uri.path;
      // get the current path of the file
      const filePath = Uri.file(fileName).path;
      // get the relative path of the file
      const relativePath = filePath.replace(rootPath!, "");
      // get the absolute path of the file
      const absolutePath = Uri.file(fileName).fsPath;

      // create a new file with the same name and content

      writeFile(Uri.file(rootPath + "/" + fileName), Buffer.from(fileContent))
        .then(() => {
          return true;
        })
        .catch((err) => {
          console.error(err);
          return false;
        });
    }
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

  const waiGenerateCommand = commands.registerCommand(
    "wai.WAIGenerate",
    async () => {
      const generationDirectionQuickPickItems: Array<QuickPickItem> = [
        {
          label: GenerationDirection.Guest,
          description: "Generate a guest file",
        },
        {
          label: GenerationDirection.Host,
          description: "Generate a host file",
        },
      ];

      const generationTypeQuickPickItems: Array<QuickPickItem> = [
        {
          label: GenerationType.Import,
          description: "Generate an import file",
        },
        {
          label: GenerationType.Export,
          description: "Generate an export file",
        },
      ];

      const hostLanguageQuickPickItems: Array<QuickPickItem> = [
        {
          label: BindingLanguage.Rust,
          description: "Generate a Rust file",
        },
        {
          label: BindingLanguage.JavaScript,
          description: "Generate a JavaScript file",
        },
        {
          label: BindingLanguage.Python,
          description: "Generate a Python file",
        },
      ];

      const guestLanguageQuickPickItems: Array<QuickPickItem> = [
        {
          label: BindingLanguage.Rust,
          description: "Generate a Rust file",
        },
        {
          label: BindingLanguage.C,
          description: "Generate a C file",
        },
      ];

      const generationDirectionOptions: QuickPickOptions = {
        placeHolder: "Select a generation type",
      };
      const languageOptions: QuickPickOptions = {
        placeHolder: "Select a language for the generated bindings",
      };
      const generationTypeOptions: QuickPickOptions = {
        placeHolder: "Select a generation type",
      };

      const generationDirectionSelection = await window.showQuickPick(
        generationDirectionQuickPickItems,
        generationDirectionOptions
      );

      if (!generationDirectionSelection) {
        return;
      }

      let languageSelection = null;
      if (generationDirectionSelection.label === GenerationDirection.Guest) {
        languageSelection = await window.showQuickPick(
          guestLanguageQuickPickItems,
          languageOptions
        );
      } else {
        languageSelection = await window.showQuickPick(
          hostLanguageQuickPickItems,
          languageOptions
        );
      }

      if (!languageSelection) {
        return;
      }

      const generationTypeSelection = await window.showQuickPick(
        generationTypeQuickPickItems,
        generationTypeOptions
      );

      if (!generationTypeSelection) {
        return;
      }

      await client
        .sendRequest("wai/generate-code", {
          generation_direction: generationDirectionSelection.label,
          binding_language: languageSelection.label,
          generation_type: generationTypeSelection.label,
          file_name: window.activeTextEditor?.document.fileName,
          file_content: window.activeTextEditor?.document.getText(),
        })
        .then((response) => {
          console.log(response);
        });
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
    save2wasmCommand,
    waiGenerateCommand
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

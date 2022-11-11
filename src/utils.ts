import { Uri, window } from "vscode";
import * as fs from "fs";
import { bindings } from "@wasmer/wabt";
import {
  WASM_FEATURE_ANNOTATIONS, WASM_FEATURE_BULK_MEMORY, WASM_FEATURE_EXCEPTIONS,
  WASM_FEATURE_GC, WASM_FEATURE_MULTI_VALUE, WASM_FEATURE_MUTABLE_GLOBALS,
  WASM_FEATURE_REFERENCE_TYPES, WASM_FEATURE_SAT_FLOAT_TO_INT,
  WASM_FEATURE_SIGN_EXTENSION, WASM_FEATURE_SIMD, WASM_FEATURE_TAIL_CALL,
  WASM_FEATURE_THREADS
} from "@wasmer/wabt/src/bindings/wabt/wabt";
import { TextDecoder, TextEncoder } from "util";

const wabt = bindings.wabt();

/**
 * @param uri - path to the file.
 */
export function getPhysicalPath(uri: Uri): string {
  if (uri.scheme === "wasm-preview") {
    return uri.with({ scheme: "file" }).fsPath;
  }

  return uri.fsPath;
}

export function readFile(uri: Uri): Promise<Buffer> {
  const filepath = getPhysicalPath(uri);

  return new Promise((resolve, reject) => {
    fs.readFile(filepath, { encoding: null }, (err: Error, data: Buffer) => {
      if (err) {
        return reject(err);
      }

      resolve(data);
    });
  });
}

export function readWasm(uri: Uri): Promise<Buffer | undefined> {
  if (uri.scheme !== "wasm-preview") {
    return;
  }

  return readFile(uri);
}

export function writeFile(uri: Uri, content: Buffer | string): Promise<void> {
  const filepath = getPhysicalPath(uri);

  return new Promise((resolve, reject) => {
    fs.writeFile(filepath, content, (err: Error) => {
      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

const WABT_FEATURES = WASM_FEATURE_ANNOTATIONS |
WASM_FEATURE_BULK_MEMORY |
WASM_FEATURE_EXCEPTIONS |
WASM_FEATURE_GC |
WASM_FEATURE_MULTI_VALUE |
WASM_FEATURE_MUTABLE_GLOBALS |
WASM_FEATURE_REFERENCE_TYPES |
WASM_FEATURE_SAT_FLOAT_TO_INT |
WASM_FEATURE_SIGN_EXTENSION |
WASM_FEATURE_SIMD |
WASM_FEATURE_TAIL_CALL |
WASM_FEATURE_THREADS ;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function wasm2wat(content: Buffer): Promise<string> {
  const result = (await wabt).wasm2wat(content, WABT_FEATURES);

  switch (result.tag) {
    case "ok":
      return result.val;
    case "err":
      window.showErrorMessage(`Error while reading the Wasm: ${result.val}`);
  }
}

export async function wat2wasm(content: Buffer): Promise<Buffer> {
  const wat = decoder.decode(content);
  const result = (await wabt).wat2wasm(wat, WABT_FEATURES);

  switch (result.tag) {
    case "ok":
      return Buffer.from(result.val);
    case "err":
      window.showErrorMessage(result.val);
  }
}

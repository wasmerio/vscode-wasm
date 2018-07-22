import { QuickPickItem } from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';

export default class WebAssemblyFunctionQuickPickItem implements QuickPickItem {
  label: string;
  description: string;
  source: DebugProtocol.Source;

  constructor(source: DebugProtocol.Source) {
    this.source = source;
    this.label = source.name;
    this.description = source.path;
  }
}

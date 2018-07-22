'use strict';

import { DebugProtocol } from 'vscode-debugprotocol';
import { debug, DebugSession, DebugSessionCustomEvent, Disposable } from 'vscode'
import { EventEmitter } from 'events'
import { SubscribeComplete } from './utils';

const wasmNamespace = '<node_internals>/wasm:'

export default class WebAssemblyDebugSession extends EventEmitter {
  private _session: DebugSession;
  private _customEvent: Disposable;
  private _loadSourcesComplete: SubscribeComplete
  private _wasmSources: DebugProtocol.Source[]

  constructor(session: DebugSession) {
    super();

    this._session = session;
    this._wasmSources = []

    this._customEvent = debug.onDidReceiveDebugSessionCustomEvent((event: DebugSessionCustomEvent) => {
      if (event.session.id !== this._session.id) {
        return
      }

      this.emit(event.event, event.body);
    });

    // TODO: move `500` to config
    this._loadSourcesComplete = new SubscribeComplete(500);

    this._loadSourcesComplete.once('complete', (sources: DebugProtocol.Source[]) => {
      const filter = (source: DebugProtocol.Source) => source.path.startsWith(wasmNamespace)

      this._wasmSources = sources.filter(filter)

      if (this._wasmSources.length > 0) {
        this.emit('wasm:sources', this.sources);
      } else {
        this.emit('error', new Error('Not found wasm files'))
      }
    });

    this.on('loadedSource', (body: LoadedSourceEventBody) => {
      if (body.reason !== 'new') {
        return
      }

      this._loadSourcesComplete.process(body.source);
    })
  }

  get sources(): ReadonlyArray<DebugProtocol.Source> {
    return Object.freeze(this._wasmSources);
  }

  async openFile(source: DebugProtocol.Source) {
    const response = await this._session.customRequest('source', { source });

    console.log('got response for `openFile`', response)
  }

  dispose() {
    this._customEvent.dispose()
    this._loadSourcesComplete.dispose()
  }
}

// DebugProtocol.LoadedSourceEvent has no separate type for it's body.
interface LoadedSourceEventBody {
  /** The reason for the event. */
  reason: 'new' | 'changed' | 'removed';
  /** The new, changed, or removed source. */
  source: DebugProtocol.Source;
}

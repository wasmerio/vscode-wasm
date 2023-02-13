use std::{collections::HashMap, hash::Hash, string};

use dashmap::DashMap;
use tower_lsp::{
    lsp_types::{
        DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams,
        DidSaveTextDocumentParams, ExecuteCommandOptions, ExecuteCommandParams, InitializeParams,
        InitializeResult, InitializedParams, MessageType, OneOf, ServerCapabilities, ServerInfo,
        TextDocumentItem, TextDocumentSyncCapability, TextDocumentSyncKind, Url,
        WorkspaceFileOperationsServerCapabilities, WorkspaceFoldersServerCapabilities,
        WorkspaceServerCapabilities,
    },
    Client, LanguageServer, LspService, Server,
    {jsonrpc::Error, jsonrpc::Result},
};

use serde_json::Value;
use wai_bindgen_gen_rust_wasm::{Opts, RustWasm};

use wai_bindgen_gen_core::{wai_parser::Interface, Direction, Files, Generator};

#[derive(Debug)]
struct WAIFile {
    file_name: String,
    file_content: String,
}

#[derive(Debug)]
struct Backend {
    client: Client,
    import_map: HashMap<String, WAIFile>,
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "wai-language-server".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
            capabilities: ServerCapabilities {
                execute_command_provider: Some(ExecuteCommandOptions {
                    commands: vec![
                        "wai-language-server.printVersion".to_string(),
                        "wai-language-server.generateWAICode".to_string(),
                    ],
                    work_done_progress_options: Default::default(),
                }),
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                workspace: Some(WorkspaceServerCapabilities {
                    workspace_folders: Some(WorkspaceFoldersServerCapabilities {
                        supported: Some(true),
                        change_notifications: Some(OneOf::Left(true)),
                    }),
                    file_operations: None,
                }),
                ..ServerCapabilities::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        let workspace = self.client.workspace_folders().await.unwrap().unwrap();
        self.client
            .log_message(MessageType::INFO, format!("{:?}", workspace))
            .await;

        self.client
            .log_message(MessageType::INFO, "server initialized!!!!!")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }
    async fn execute_command(&self, params: ExecuteCommandParams) -> Result<Option<Value>> {
        match params.command.as_str() {
            "wai-language-server.printVersion" => {
                let crate_name = env!("CARGO_PKG_NAME");
                let version = env!("CARGO_PKG_VERSION");

                self.client
                    .show_message(MessageType::INFO, format!("{crate_name} {version}"))
                    .await;
                Ok(None)
            }
            "wai-language-server.generateWAICode" => {
                self.generate_wai().await;
                Ok(None)
            }
            _ => Err(Error::invalid_request()),
        }
    }
    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = &params.text_document.uri;
        let text = &params.text_document.text;
        let version = &params.text_document.version;
        let lang_id = &params.text_document.language_id;

        self.import_map.insert(
            uri.to_string(),
            WAIFile {
                file_name: uri.to_string(),
                file_content: text.to_string(),
            },
        );

        self.client
            .log_message(
                MessageType::INFO,
                format!("{:?} {:?} {:?} {:?}", uri, text, version, lang_id),
            )
            .await;

        self.client
            .log_message(MessageType::INFO, "file opened!")
            .await;
        // self.on_change(TextDocumentItem {
        //     uri: params.text_document.uri,
        //     text: params.text_document.text,
        //     version: params.text_document.version,
        // })
        // .await
    }

    async fn did_change(&self, mut params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri;
        let text = std::mem::take(&mut params.content_changes[0].text);
        // self.wai_file = Some(WAIFile {
        //     file_name: uri.to_string(),
        //     file_content: text.clone(),
        // });
        self.client
            .log_message(MessageType::INFO, format!("{:?}", text))
            .await;

        // self.on_change(TextDocumentItem {
        //     uri: params.text_document.uri,
        //     text: std::mem::take(&mut params.content_changes[0].text),
        //     version: params.text_document.version,
        // })
        // .await
    }

    async fn did_save(&self, _: DidSaveTextDocumentParams) {
        self.client
            .log_message(MessageType::INFO, "file saved!")
            .await;
    }

    async fn did_close(&self, _: DidCloseTextDocumentParams) {
        self.client
            .log_message(MessageType::INFO, "file closed!")
            .await;
    }
}

impl Backend {
    async fn generate_wai(&self) {
        let mut files = Files::default();

        let import_file = self.import_map.values().next().unwrap();

        let interface =
            Interface::parse(&import_file.file_name, &import_file.file_content).unwrap();

        let opts = Opts {
            rustfmt: true,
            force_generate_structs: true,
            ..Default::default()
        };
        let mut gen = opts.build();

        let imports = vec![interface];
        let exports = vec![];

        gen.generate_all(&imports, &exports, &mut files);

        for file in files.iter() {
            self.client
                .log_message(
                    MessageType::INFO,
                    format!("{:?} {:?}", file.0, String::from_utf8(file.1.to_vec())),
                )
                .await;
        }
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::build(|client| Backend {
        client,
        import_map: HashMap::new(),
    })
    .finish();
    Server::new(stdin, stdout, socket).serve(service).await;
}

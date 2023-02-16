use std::{collections::HashMap, hash::Hash, string, sync::Mutex};

use dashmap::DashMap;
use tower_lsp::{
    lsp_types::{
        request::{Request, ShowDocument, ShowMessageRequest},
        DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams,
        DidSaveTextDocumentParams, ExecuteCommandOptions, ExecuteCommandParams, HoverParams,
        InitializeParams, InitializeResult, InitializedParams, MessageType, OneOf,
        ServerCapabilities, ServerInfo, ShowMessageParams, TextDocumentItem,
        TextDocumentSyncCapability, TextDocumentSyncKind, Url,
        WorkspaceFileOperationsServerCapabilities, WorkspaceFoldersServerCapabilities,
        WorkspaceServerCapabilities,
    },
    Client, LanguageServer, LspService, Server,
    {jsonrpc::Error, jsonrpc::Result},
};

use serde::{de, de::Error as Error_, Deserialize, Serialize};
use serde_json::Value;
use wai_bindgen_gen_c::{Opts as CGuestGenOpts, C as CGuest};
use wai_bindgen_gen_js::{Js as JsGuest, Opts as JsGuestGenOpts};
use wai_bindgen_gen_rust_wasm::{Opts as RustGuestGenOpts, RustWasm as RustGuest};
use wai_bindgen_gen_wasmer::{Async, Opts as RustHostGenOpts, Wasmer as RustHost};
use wai_bindgen_gen_wasmer_py::{Opts as PyHostGenOpts, WasmerPy as PyHost};

use wai_bindgen_gen_core::{wai_parser::Interface, Direction, Files, Generator};

pub enum saveFileRequest {}

#[derive(Debug, Eq, PartialEq, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct saveFileParams {
    file_name: Option<String>,
    file_content: Option<Vec<u8>>,
}

impl Request for saveFileRequest {
    type Params = saveFileParams;
    type Result = ();
    const METHOD: &'static str = "wai/saveFile";
}

#[derive(Debug)]
struct WAIFile {
    file_name: String,
    file_content: String,
}

#[derive(Debug)]
struct Backend {
    client: Client,
    import_map: DashMap<String, WAIFile>,
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
                let mut files = Files::default();
                self.generate_wai(&mut files);

                for (file_name, file_content) in files.iter() {
                    self.client
                        .send_request::<saveFileRequest>(saveFileParams {
                            file_name: Some(file_name.to_string()),
                            file_content: Some(file_content.to_vec()),
                        })
                        .await
                        .unwrap();
                }

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

        // self.client
        //     .log_message(
        //         MessageType::INFO,
        //         format!("{:?} {:?} {:?} {:?}", uri, text, version, lang_id),
        //     )
        //     .await;

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

#[derive(Debug, Deserialize, Serialize)]
enum BindingLanguage {
    Rust,
    JavaScript,
    Python,
    C,
}

impl From<BindingLanguage> for String {
    fn from(val: BindingLanguage) -> Self {
        match val {
            BindingLanguage::Rust => "Rust".to_string(),
            BindingLanguage::JavaScript => "Javascript".to_string(),
            BindingLanguage::Python => "Python".to_string(),
            BindingLanguage::C => "C".to_string(),
        }
    }
}

impl From<&str> for BindingLanguage {
    fn from(s: &str) -> Self {
        match s {
            "Rust" => BindingLanguage::Rust,
            "Javascript" => BindingLanguage::JavaScript,
            "Python" => BindingLanguage::Python,
            "C" => BindingLanguage::C,
            _ => panic!("Unknown binding language"),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
enum GenerationDirection {
    Guest,
    Host,
}

impl From<GenerationDirection> for String {
    fn from(val: GenerationDirection) -> Self {
        match val {
            GenerationDirection::Guest => "Guest".to_string(),
            GenerationDirection::Host => "Host".to_string(),
        }
    }
}

impl From<&str> for GenerationDirection {
    fn from(s: &str) -> Self {
        match s {
            "Guest" => GenerationDirection::Guest,
            "Host" => GenerationDirection::Host,
            _ => panic!("Unknown generation type"),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
enum GenerationType {
    Import,
    Export,
}

impl From<GenerationType> for String {
    fn from(val: GenerationType) -> Self {
        match val {
            GenerationType::Import => "Import".to_string(),
            GenerationType::Export => "Export".to_string(),
        }
    }
}

impl From<&str> for GenerationType {
    fn from(s: &str) -> Self {
        match s {
            "Import" => GenerationType::Import,
            "Export" => GenerationType::Export,
            _ => panic!("Unknown generation type"),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct WAIGeneratorParams {
    generation_direction: GenerationDirection,
    generation_type: GenerationType,
    binding_language: BindingLanguage,
    file_name: String,
    file_content: String,
}

impl Backend {
    async fn generate_wai_code(&self, params: WAIGeneratorParams) -> Result<()> {
        let WAIGeneratorParams {
            binding_language,
            generation_direction,
            generation_type,
            file_name,
            file_content,
        } = params;

        let mut files = Files::default();

        let interface = Interface::parse(&file_name, &file_content).unwrap();

        let (imports, exports): (Vec<Interface>, Vec<Interface>) = match generation_type {
            GenerationType::Import => (vec![interface], vec![]),
            GenerationType::Export => (vec![], vec![interface]),
        };

        match generation_direction {
            GenerationDirection::Guest => match binding_language {
                BindingLanguage::Rust => {
                    let opts = RustGuestGenOpts {
                        rustfmt: true,
                        force_generate_structs: true,
                        ..Default::default()
                    };
                    let mut gen = opts.build();
                    gen.generate_all(&imports, &exports, &mut files)
                }
                BindingLanguage::C => (),
                _ => {
                    let opts = CGuestGenOpts {};
                    let mut gen = opts.build();
                    gen.generate_all(&imports, &exports, &mut files)
                }
            },
            GenerationDirection::Host => match binding_language {
                BindingLanguage::Rust => {
                    let opts = RustHostGenOpts {
                        rustfmt: true,
                        tracing: true,
                        async_: Async::None,
                        custom_error: false,
                    };
                    let mut gen = opts.build();
                    gen.generate_all(&imports, &exports, &mut files)
                }
                BindingLanguage::JavaScript => {
                    let opts = JsGuestGenOpts {
                        no_typescript: false,
                    };
                    let mut gen = opts.build();
                    gen.generate_all(&imports, &exports, &mut files)
                }
                BindingLanguage::Python => {
                    let opts = PyHostGenOpts {
                        no_typescript: true,
                    };
                    let mut gen = opts.build();
                    gen.generate_all(&imports, &exports, &mut files)
                }
                _ => {
                    panic!("Unsupported binding for Host")
                }
            },
        }

        for (file_name, file_content) in files.iter() {
            self.client
                .send_request::<saveFileRequest>(saveFileParams {
                    file_name: Some(file_name.to_string()),
                    file_content: Some(file_content.to_vec()),
                })
                .await
                .unwrap();
        }

        Ok(())
    }

    fn generate_wai(&self, files: &mut Files) {
        let import_file = self.import_map.iter().next().unwrap();

        let interface =
            Interface::parse(&import_file.file_name, &import_file.file_content).unwrap();

        let opts = RustGuestGenOpts {
            rustfmt: true,
            force_generate_structs: true,
            ..Default::default()
        };
        let mut gen = opts.build();

        let imports = vec![interface];
        let exports = vec![];

        gen.generate_all(&imports, &exports, files);

        // for file in files.iter() {
        //     self.client
        //         .log_message(
        //             MessageType::INFO,
        //             format!("{:?} {:?}", file.0, String::from_utf8(file.1.to_vec())),
        //         )
        //         .await;
        // }
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::build(|client| Backend {
        client,
        import_map: DashMap::new(),
    })
    .custom_method("wai/generate-code", Backend::generate_wai_code)
    .finish();
    Server::new(stdin, stdout, socket).serve(service).await;
}

use tower_lsp::{
    lsp_types::{
        ExecuteCommandOptions, ExecuteCommandParams, InitializeParams, InitializeResult,
        InitializedParams, MessageType, ServerCapabilities,
    },
    Client, LanguageServer, LspService, Server,
    {jsonrpc::Error, jsonrpc::Result},
};

use serde_json::Value;

#[derive(Debug)]
struct Backend {
    client: Client,
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                execute_command_provider: Some(ExecuteCommandOptions {
                    commands: vec!["wai-language-server.printVersion".to_string()],
                    work_done_progress_options: Default::default(),
                }),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "server initialized!")
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
            _ => Err(Error::invalid_request()),
        }
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::new(|client| Backend { client });
    Server::new(stdin, stdout, socket).serve(service).await;
}

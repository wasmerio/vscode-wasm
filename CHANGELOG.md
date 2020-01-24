# Change Log
All notable changes to the "wasm" extension will be documented in this file.

## Unreleased
- Updated grammar with the latest spec [#21](https://github.com/wasmerio/vscode-wasm/pull/21)
- Improved README & logo
- Updated dependencies
- Added basic snipets for wat [#16](https://github.com/wasmerio/vscode-wasm/pull/16) 

## [1.2.1] - 2018-10-01
- Improved syntax grammar ([@AlexanderOtavka](https://github.com/AlexanderOtavka))
- Fixed a bug with incorrect name resolution. [#14](https://github.com/reklatsmasters/vscode-wasm/issues/14)

## [1.2.0] - 2018-05-12
- Ability to save .wasm files to .wat and .wat files to .wasm
- Move to [wabt](https://www.npmjs.com/package/wabt) parser / printer again. [WebAssemblyjs](https://github.com/xtuc/webassemblyjs) seems unstable.

## [1.1.1] - 2018-04-20
- Update dependencies.

## [1.1.0] - 2018-04-09
- Added icon ([@bitjson](https://github.com/bitjson))
- Support large wasm files. Now a pure js wasm parser / printer [webassemblyjs](https://github.com/xtuc/webassemblyjs) is used.

## [1.0.1] - 2017-12-04
- Fix badges only.

## [1.0.0] - 2017-12-04
### Added
- Open WebAssembly binary files from context menu.
- Syntax highlighting.

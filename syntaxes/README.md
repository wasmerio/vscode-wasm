This grammar covers the instructions of the following standards respectively proposals (Jan. 2020):

* [MVP](https://webassembly.github.io/spec/core/text/index.html)
* [Non-trapping float-to-int conversions](https://github.com/WebAssembly/nontrapping-float-to-int-conversions)
* [Sign-extension operators](https://github.com/WebAssembly/sign-extension-ops)
* [Bulk memory operations](https://github.com/WebAssembly/bulk-memory-operations)
* [Fixed-width SIMD](https://github.com/WebAssembly/simd)
* [Threads](https://github.com/WebAssembly/threads)
* [Reference types](https://github.com/WebAssembly/reference-types)
* [Tail Call](https://github.com/WebAssembly/tail-call)
* [Exception handling](https://github.com/WebAssembly/exception-handling)

Plus a few non-standard extensions not actually part of the language, but used in intermediate files produced by popular tooling:

* [Binaryen extensions](https://github.com/WebAssembly/binaryen) (pseudo `.push`/`.pop`)

Pattern names as of [Sublime Text / Scope Naming](https://www.sublimetext.com/docs/3/scope_naming.html).

TODO: The grammar does not (yet) attempt to recognize individual contents of the various sections. So far, most patterns are applied globally.

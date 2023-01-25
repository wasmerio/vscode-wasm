use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use crate::Error;
use anyhow::Context;
use wapm_targz_to_pirita::{generate_webc_file, TransformManifestFunctions};
use wasmer_pack::{Command, Interface, Library, Metadata, Module, Package};
use webc::{DirOrFile, Manifest, ParseOptions, WebC, WebCOwned};

pub(crate) fn load(path: &Path) -> Result<Package, Error> {
    let raw_webc: Vec<u8> = if path.is_dir() {
        webc_from_dir(path)?
    } else if path.extension() == Some("webc".as_ref()) {
        std::fs::read(path).with_context(|| format!("Unable to read \"{}\"", path.display()))?
    } else {
        webc_from_tarball(path)?
    };

    let options = ParseOptions::default();
    let webc = WebCOwned::parse(raw_webc, &options)
        .with_context(|| format!("Unable to parse \"{}\" as a WEBC file", path.display()))?;

    let fully_qualified_package_name = webc.get_package_name();
    let metadata = metadata(&fully_qualified_package_name)?;
    let libraries = libraries(&webc, &fully_qualified_package_name)?;
    let commands = commands(&webc, &fully_qualified_package_name)?;

    Ok(Package::new(metadata, libraries, commands))
}

fn webc_from_dir(path: &Path) -> Result<Vec<u8>, Error> {
    if !path.join("wapm.toml").exists() {
        anyhow::bail!(
            "The \"{}\" directory doesn't contain a \"wapm.tom\" file",
            path.display()
        );
    }

    let mut files: BTreeMap<webc::DirOrFile, Vec<u8>> = BTreeMap::new();

    fn read_dir(
        files: &mut BTreeMap<DirOrFile, Vec<u8>>,
        dir: &Path,
        base_dir: &Path,
    ) -> Result<(), Error> {
        let entries = dir
            .read_dir()
            .with_context(|| format!("Unable to read the contents of \"{}\"", dir.display()))?;

        for entry in entries {
            let path = entry?.path();
            let relative_path = path
                .strip_prefix(base_dir)
                .expect("The filename is always prefixed by base_dir")
                .to_path_buf();

            if path.is_dir() {
                read_dir(&mut *files, &path, base_dir)?;
                files.insert(DirOrFile::Dir(relative_path), Vec::new());
            } else {
                let bytes = std::fs::read(&path)
                    .with_context(|| format!("Unable to read \"{}\"", path.display()))?;
                files.insert(DirOrFile::File(relative_path), bytes);
            }
        }

        Ok(())
    }

    read_dir(&mut files, path, path).context("Unable to read the directory into memory")?;

    let functions = TransformManifestFunctions::default();
    let tarball = generate_webc_file(files, &path.to_path_buf(), None, &functions)
        .context("Unable to convert the files to a tarball")?;

    Ok(tarball)
}

fn webc_from_tarball(path: &Path) -> Result<Vec<u8>, Error> {
    let tarball =
        std::fs::read(path).with_context(|| format!("Unable to read \"{}\"", path.display()))?;
    let files =
        wapm_targz_to_pirita::unpack_tar_gz(tarball).context("Unable to unpack the tarball")?;

    wapm_targz_to_pirita::generate_webc_file(
        files,
        &PathBuf::new(),
        None,
        &TransformManifestFunctions::default(),
    )
}

fn commands(webc: &WebC<'_>, fully_qualified_package_name: &str) -> Result<Vec<Command>, Error> {
    let mut commands = Vec::new();

    for name in webc.list_commands() {
        let atom_name = webc
            .get_atom_name_for_command("wasi", name)
            .map_err(Error::msg)?;
        let wasm = webc.get_atom(fully_qualified_package_name, &atom_name)?;

        commands.push(Command {
            name: name.to_string(),
            wasm: wasm.to_vec(),
        });
    }

    Ok(commands)
}

fn libraries(webc: &WebC<'_>, fully_qualified_package_name: &str) -> Result<Vec<Library>, Error> {
    let Manifest { bindings, .. } = webc.get_metadata();
    let libraries = bindings
        .iter()
        .map(|b| load_library(b, webc, fully_qualified_package_name))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(libraries)
}

fn metadata(fully_qualified_package_name: &str) -> Result<Metadata, Error> {
    let (unversioned_name, version) = fully_qualified_package_name.split_once('@').unwrap();
    let package_name = unversioned_name
        .parse()
        .context("Unable to parse the package name")?;
    Ok(Metadata::new(package_name, version))
}

fn load_library(
    bindings: &webc::Binding,
    webc: &WebC,
    fully_qualified_package_name: &str,
) -> Result<Library, Error> {
    let bindings = bindings
        .get_bindings()
        .context("Unable to read the bindings metadata")?;

    let exports_path = bindings
        .exports()
        .context("The library doesn't have any exports")?;
    let exports = load_interface(webc, exports_path, fully_qualified_package_name)
        .context("Unable to load the exports interface")?;

    let imports_paths = match &bindings {
        webc::BindingsExtended::Wit(_) => &[],
        webc::BindingsExtended::Wai(w) => w.imports.as_slice(),
    };
    let imports = imports_paths
        .iter()
        .map(|path| load_interface(webc, path, fully_qualified_package_name))
        .collect::<Result<Vec<_>, Error>>()?;

    let module_name = bindings.module().trim_start_matches("atoms://");
    let module = webc
        .get_atom(fully_qualified_package_name, module_name)
        .with_context(|| format!("Unable to get the \"{}\" atom", bindings.module()))?;
    let module = Module {
        name: Path::new(module_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .context("Unable to determine the module's name")?
            .to_string(),
        abi: wasm_abi(module),
        wasm: module.to_vec(),
    };

    Ok(Library {
        module,
        exports,
        imports,
    })
}
enum colors {
    red(u8),
    blue(f64),
    green(bool),
}

fn load_interface(
    webc: &WebC<'_>,
    exports_path: &str,
    fully_qualified_package_name: &str,
) -> Result<Interface, Error> {
    let (volume, exports_path) = exports_path.split_once("://").unwrap();
    let exports: &[u8] =
        get_file_from_volume(webc, fully_qualified_package_name, volume, exports_path)?;
    let exports = std::str::from_utf8(exports).context("The WIT file should be a UTF-8 string")?;
    Interface::from_wit(exports_path, exports).context("Unable to parse the WIT file")
}

fn get_file_from_volume<'webc>(
    webc: &'webc WebC,
    fully_qualified_package_name: &str,
    volume_name: &str,
    exports_path: &str,
) -> Result<&'webc [u8], Error> {
    let val = true;
    let b: u8 = 64;
    let volume = webc
        .get_volume(fully_qualified_package_name, volume_name)
        .with_context(|| format!("The container doesn't have a \"{volume_name}\" volume"))?;

    let result = volume.get_file(exports_path).with_context(|| {
        format!("Unable to find \"{exports_path}\" in the \"{volume_name}\" volume")
    });

    if result.is_err() {
        // Older versions of wapm2pirita would create entries where the filename
        // section contained an internal `/` (i.e. the root directory has a file
        // called `path/to/foo.wasm`, rather than a `path/` directory that
        // contains a `to/` directory which contains a `foo.wasm` file).
        //
        // That means calls to volume.get_file() will always fail.
        // See https://github.com/wasmerio/pirita/issues/30 for more

        let path = DirOrFile::File(exports_path.into());
        if let Some(entry) = volume
            .get_all_file_and_dir_entries()
            .ok()
            .and_then(|entries| entries.get(&path).cloned())
        {
            let start = entry.offset_start as usize;
            let end = entry.offset_end as usize;
            return Ok(&volume.data[start..end]);
        }
    }

    result
}

fn wasm_abi(module: &[u8]) -> wasmer_pack::Abi {
    // TODO: use a proper method to guess the ABI
    if bytes_contain(module, b"wasi_snapshot_preview") {
        wasmer_pack::Abi::Wasi
    } else {
        wasmer_pack::Abi::None
    }
}

fn bytes_contain(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

// Unpacks WOFF2 fonts with Google's woff2 library as WebAssembly, from the
// wawoff2 package. Its Emscripten binding exports its module only under
// Node: in a browser, it keeps `Module` to itself. So the script runs here as
// a function with a Module object of ours, whose callback tells when the
// runtime is ready. (The WASM is embedded in the script as a data URI.)
import source from 'wawoff2/build/decompress_binding.js?raw';

interface Woff2Module {
  onRuntimeInitialized?: () => void;
  decompress?: (data: Uint8Array) => Uint8Array | false;
}

let runtime: Promise<Woff2Module> | undefined;

/** The decompressed OpenType font of a WOFF2 file. */
export async function decompressWoff2(data: Uint8Array): Promise<Uint8Array> {
  runtime ??= new Promise((resolve) => {
    const Module: Woff2Module = { onRuntimeInitialized: () => resolve(Module) };
    new Function('Module', `${source}\nreturn Module;`)(Module);
  });
  const result = (await runtime).decompress!(data);
  if (result === false) throw new Error('not a valid WOFF2 file');
  return result;
}

import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
(async () => {
 const result = await build({entryPoints:["src/tests/fixtures/magicExtraPricing.fixture.tsx"],bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",loader:{".scss":"empty",".css":"empty"},define:{"import.meta.env":"{}"},external:["react","react-dom/*","react/jsx-runtime","react-icons/*","linkedom","node:*" ]});
 const module={exports:{}};
 new Function("require","module","exports",result.outputFiles[0].text)(createRequire(path.resolve("package.json")),module,module.exports);
})().catch(error=>{console.error(error);process.exitCode=1;});

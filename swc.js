const swc = require("@swc/core");
const cli = require("@swc/cli");
const path = require("node:path");

const entryResolved = path.resolve(process.cwd(), "./src/extension.js");
const entry = path.normalize(entryResolved);
// console.log( 'entry', entry );

/** @type {import("@swc/core/spack").BundleInput} */
const minimalBundleInputOptions = {
	entry: entry, // must be absolute
	// entry : "./src/extension.js", // must be absolute // \\?\C:\code\Template Strings Kit\src\extension.js
	output: {
		name: "swc.js",
		path: "./dist/", // must be absolute
	},
	module: {},
};

/** @type {import("@swc/core/spack").BundleInput} */
const bundleInputOptions = {
	...minimalBundleInputOptions,
	mode: "production",
	target: "node",
};

swc.bundle(bundleInputOptions).then((out) => {
	// swc.minify( bundleInputOptions.output.path, {
	//     compress : true,
	//     mangle : true,
	//     outputPath : "./dist/min/min.js"
	// } )
});

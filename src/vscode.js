const vscode = require("vscode");
// const fs = require("fs")
const path = require("node:path");

// prevent using swc for now, until vscode make easy to use .node
// or another language as go or rush.
// const swc = require("@swc/core")
const swc = {};

const babel = require("@babel/core");
const babelPresetEnv = require("@babel/preset-env");
const babelPresetReact = require("@babel/preset-react");

/**
 * @typedef { {
 *   content: string,
 *   relativePosition: vscode.Position,
 *   isInside : boolean,
 *   language : "html" | "css" | "jsx" | "",
 *   range : vscode.Range,
 * } } TemplateStringInfo
 */

/**
 * @param {string} dirpath - the path of the directory for read
 * @param {boolean} onENOENTCreate - aka FileNotFound, if not file or directory, then create
 * @param {boolean} onErrorEmptyArray - when true,
 * if a error is throwed, is ignored and an empty array is returned
 */
async function readDirAsync(
	dirpath,
	onENOENTCreate = false,
	onErrorEmptyArray = false,
) {
	let files = null;
	try {
		// const stats = await fs.promises.stat(dirpath);
		const uri = vscode.Uri.file(dirpath);
		const stats = await vscode.workspace.fs.stat(uri);

		// if (stats.isFile()) {
		if (stats.type === vscode.FileType.File) {
			const msg = "readDirAsync. dirpath is a file";
			vscode.window.showErrorMessage(msg);
			throw new Error(msg);
		}

		// files = await fs.promises.readdir(dirpath);
		files = await vscode.workspace.fs.readDirectory(uri);
	} catch (e) {
		if (onErrorEmptyArray) files = [];
		if ((e.code === "ENOENT" || e.code === "FileNotFound") && onENOENTCreate) {
			// await fs.promises.mkdir(dirpath);
			const uri = vscode.Uri.file(dirpath);
			await vscode.workspace.fs.createDirectory(uri);
			// files = await fs.promises.readdir(dirpath);
			files = await vscode.workspace.fs.readDirectory(uri);
		}
		if (!Array.isArray(files)) vscode.window.showErrorMessage(e);
		if (!Array.isArray(files)) throw e;
	}

	return files;
}

/**
 * @param {string} filepath - the path of the file to read, must has permission to read
 * @param {boolean} onENOENTCreate - aka, if not file or directory, then create
 * @param {string} defaultContent - if ENOENT, the default content to write
 * @param {boolean} onErrorEmptyString - when true,
 * if a error is throwed, is ignored and an empty string is returned
 */
async function readFileAsync(
	filepath,
	onENOENTCreate = false,
	defaultContent = "",
	onErrorEmptyString = false,
) {
	let content = null;
	try {
		// content = await fs.promises.readFile(filepath, "utf-8")
		const uri = vscode.Uri.file(filepath);
		const bufRead = await vscode.workspace.fs.readFile(uri);
		content = bufRead.toString(); // .toString() is default to utf8 = .toString("utf8")
	} catch (e) {
		if (onErrorEmptyString) content = "";

		if ((e.code == "ENOENT" || e.code == "FileNotFound") && onENOENTCreate) {
			// await fs.promises.writeFile(filepath, defaultContent, "utf-8")
			// content = await fs.promises.readFile(filepath, "utf-8")
			const uri = vscode.Uri.file(filepath);
			const buffer = Buffer.from(defaultContent);
			await vscode.workspace.fs.writeFile(uri, buffer);
			const bufRead = await vscode.workspace.fs.readFile(uri);
			content = bufRead.toString();
		}
		if (typeof content !== "string") {
			vscode.window.showErrorMessage(e);
			throw e;
		}
	}

	return content;
}

/**
 * @param {vscode.ExtensionContext} context - context for look at the globalStorageUri
 * @param {string} filepath - the path of the file to read, relative to the globalStorageUri
 */
async function readFileInStoreAsync(context, filepath) {
	const storeDirPath = await getStoreDirPathAsync(context, true);
	const pathJoined = path.join(storeDirPath, filepath);
	const pathNormalized = path.normalize(pathJoined);
	const content = await readFileAsync(pathNormalized, true);
	return content;
}

/**
 * return global storage uri path
 *
 * context.extensionUri      // fsPath = c:\\code\\html-plugin\\string-html-intellisense'
 * context.storageUri        // fsPath = c:\\Users\\pc\\AppData\\Roaming\\Code\\User\\workspaceStorage\\4ee0e44213095fd205e97b92445326a7\\sv.strings-intellisense'
 * context.globalStorageUri  // fsPath = c:\\Users\\pc\\AppData\\Roaming\\Code\\User\\globalStorage\\your-publisher-name.my-vscode-extension'
 * plugin install path       // path   = %USERPROFILE%\.vscode\extensions
 *
 * @param {vscode.ExtensionContext} context
 * @param {boolean} onENOENTCreate - aka, if not file or directory, then create
 */
async function getStoreDirPathAsync(context, onENOENTCreate = false) {
	const storeDirPath = path.normalize(context.globalStorageUri.fsPath);
	await readDirAsync(storeDirPath, onENOENTCreate);
	return storeDirPath;
}

/**
 * @param {string} filePath - must has permission to write
 * @param {string} content
 * @param {boolean} onErrorVoid - when true,
 * if a error is throwed, is ignored and an void is returned
 */
async function writeFileAsync(filePath, content, onErrorVoid = false) {
	try {
		// await fs.promises.writeFile(filePath, content, 'utf-8');
		const uri = vscode.Uri.file(filePath);
		const buffer = Buffer.from(content);
		await vscode.workspace.fs.writeFile(uri, buffer);
	} catch (e) {
		if (!onErrorVoid) throw e;
	}
}

/**
 * @param {vscode.ExtensionContext} context - context for look at the globalStorageUri
 * @param {string} filepath - the path of the file to write, relative to the globalStorageUri
 * @param {string} content
 */
async function writeFileInStoreAsync(context, filepath, content) {
	const storeDirPath = await getStoreDirPathAsync(context, true);
	const pathJoined = path.join(storeDirPath, filepath);
	const pathNormalized = path.normalize(pathJoined);
	await writeFileAsync(pathNormalized, content);
}

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @param { RegExp } prefixPattern
 */
async function getTemplateStringInfoAsync(document, position, prefixPattern) {
	const posInit = new vscode.Position(0, 0);

	/** @type { TemplateStringInfo } */
	const ret = {
		content: "",
		relativePosition: posInit,
		isInside: false,
		language: "",
		range: new vscode.Range(posInit, posInit),
	};

	/** @type { Promise< TemplateStringInfo >} */
	const prom = new Promise((resolve, reject) => {
		try {
			const text = document.getText();
			const offset = document.offsetAt(position);
			const before = text.substring(0, offset);

			// prefixFoundRegexs is the result of get all template strings present in the document,
			// in duples of regExpExec with the format "prefix", "intern",
			// example, a document with two template strings prefixed with /*html*/ and /*css*/
			// result -> [ [ "/*html*/", "html" ], [ "/*css*/", "css" ] ]
			const prefixFoundRegexs = [...before.matchAll(prefixPattern)];
			const lastLanguageFoundRegexs = prefixFoundRegexs.pop();
			if (!lastLanguageFoundRegexs || lastLanguageFoundRegexs.length < 1)
				return resolve(ret);

			let language = lastLanguageFoundRegexs[1];
			if (language == "html5" || language == "htmx" || language == "html")
				language = "html";
			if (language == "style" || language == "stylesheet" || language == "css")
				language = "css";
			if (language == "jsx") language = "jsx";
			if (language != "html" && language != "css" && language != "jsx")
				ret.language = "";
			else ret.language = language;

			const prefixStart = lastLanguageFoundRegexs.index;
			const prefixEnd =
				lastLanguageFoundRegexs.index + lastLanguageFoundRegexs[0].length;
			const startPos = document.positionAt(prefixStart);
			const endPos = document.positionAt(prefixEnd);
			const range = new vscode.Range(startPos, endPos);
			ret.range = range;

			const after = text.substring(prefixEnd);
			const closingBacktickIndex = after.indexOf("`");
			if (
				closingBacktickIndex === -1 ||
				offset <= prefixEnd + closingBacktickIndex
			)
				ret.isInside = true;

			if (!ret.language || !ret.isInside) {
				return resolve(ret);
			}

			const relativeOffset = offset - prefixEnd;
			const relativeTextBefore = after.substring(0, relativeOffset);
			const relativeLines = relativeTextBefore.split("\n");
			const relativePosition = new vscode.Position(
				relativeLines.length - 1,
				relativeLines[relativeLines.length - 1].length,
			);
			const content = after.substring(0, closingBacktickIndex);

			ret.content = content;
			ret.relativePosition = relativePosition;
			return resolve(ret);
		} catch (e) {
			const error = new Error(`Error on getTemplateStringInfoAsync, ${e}`);
			return reject(ret);
		}
	});

	return prom;
}

/**
 * @param {string} filePath
 * @param {string} fileContent
 * @param {vscode.Position} [overriderPosition]
 */
async function getCompletionListFromFilePathAsync(
	filePath,
	fileContent,
	overriderPosition,
) {
	const uri = vscode.Uri.file(filePath);

	// parse the position
	const line = fileContent.split("\n").length - 1;
	const character = fileContent.split("\n").pop().length;
	let position = new vscode.Position(line, character);
	if (overriderPosition) position = overriderPosition;

	/** @type {vscode.CompletionList} */
	const list = await vscode.commands.executeCommand(
		"vscode.executeCompletionItemProvider",
		uri,
		position,
		"",
	);

	return list;
}

/**
 * after use vscode.commands.executeCommand,
 * some results could be softly "incompleted",
 * for the fact than are implicitly created.
 * this function re-set the most valuable props,
 * resulting in a object more explicit,
 * fixing some holes in the declaration
 * @param {vscode.CompletionItem[]} completionItems
 */
function completionItemsExpliciter(completionItems) {
	const items = completionItems.map((item) => {
		const newItem = new vscode.CompletionItem(item.label, item.kind);
		newItem.insertText = item.insertText;
		newItem.documentation = item.documentation;
		newItem.detail = item.detail;
		return newItem;
	});
	return items;
}

function getCurrentInfo() {
	const currentEditor = vscode.window.activeTextEditor;
	const currentTextDocument = currentEditor.document;
	const currentPosition = currentEditor.selection.active;
	const currentOffset = currentTextDocument.offsetAt(currentPosition);
	return { currentEditor, currentTextDocument, currentPosition, currentOffset };
}

/**
 * create jsx diagnostic in a document, from a content in a range
 * @param { vscode.DiagnosticCollection } diagnosticCollection
 * @param {vscode.TextDocument} document
 * @param {string} content
 * @param {vscode.Range} range
 */
async function createJsxDiagnosticWithSwcFromContentInRange(
	diagnosticCollection,
	document,
	content,
	range,
) {
	diagnosticCollection.clear();

	try {
		await swc.transform(content, {
			jsc: {
				parser: {
					syntax: "ecmascript",
					jsx: true,
				},
			},
		});
	} catch (e) {
		const { line, column } = strExtractLineColumn(e.message);
		const diag = createDiagnosticFromError(e);

		const start = new vscode.Position(
			range.start.line + line - 1,
			range.start.character + column,
		);
		const end = new vscode.Position(
			range.start.line + line - 1,
			range.start.character + column,
		);
		const rangeOffset = new vscode.Range(start, end);

		diag.range = rangeOffset;
		diagnosticCollection.set(document.uri, [diag]);
	}
}

/**
 * create jsx diagnostic in a document, from a content in a range
 * @param { vscode.DiagnosticCollection } diagnosticCollection
 * @param {vscode.TextDocument} document
 * @param {string} content
 * @param {vscode.Range} range
 */
async function createJsxDiagnosticWithBabelFromContentInRange(
	diagnosticCollection,
	document,
	content,
	range,
) {
	diagnosticCollection.clear();

	try {
		await babel.transformAsync(content, {
			presets: [babelPresetEnv, babelPresetReact],
			plugins: [],
			highlightCode: false, // prevent ansi code floating away
		});
	} catch (e) {
		// "Cannot find package '@babel/preset-env' imported from C:\\Program Files\\Microsoft VS Code\\babel-virtual-resolve-base.js"
		const { line, column } = strExtractLineColumn(e.message);
		const diag = createDiagnosticFromError(e);

		const start = new vscode.Position(
			range.start.line + line - 1,
			range.start.character + column,
		);
		const end = new vscode.Position(
			range.start.line + line - 1,
			range.start.character + column,
		);
		const rangeOffset = new vscode.Range(start, end);

		diag.range = rangeOffset;
		diagnosticCollection.set(document.uri, [diag]);
	}
}

/**
 * extract the line and column from a string.
 *
 * first, try in lines like :
 * - string :" lorem ipsum line 72 column 953 lorem ipsum "
 * - regex  : /line\s*:?\s*(\d*),?\s*column\s*:?\s*(\d*)/im
 * if not :
 * - string : "lorem : invalid character ipsum at 6:30"
 * - regex  : /invalid character (["']?.*?["']?) at (\d+):(\d+)/im
 *
 * finally  :
 * - string : any string but in brackets with dots ":", ...,-[2:13]<img s...
 * - regex  : /\[(\d+):(\d+)\]/im;
 *
 * @param {string} string
 */
function strExtractLineColumn(string) {
	// for errors like : "line 72 column 953 lorem ipsum"
	const regexLineDigitColumnDigit =
		/line\s*:?\s*(\d*),?\s*column\s*:?\s*(\d*)/im;

	// for errors like : "lorem : invalid character ipsum at 6:30 | (6:30)"
	const regexLineCharacterLineDigitColumnDigit = /\(*(\d+):(\d+)\)*/im;

	// for errors like : any string but in brackets with dots ":", ...,-[2:13]<img s...
	// const regexBracketsLineDotsColumn = /\[(\d+):(\d+)\]/im;
	const regexBracketsLineDotsColumn = /\[(\d+):(\d+)\]/im;

	/** @type {RegExpMatchArray} */
	let match = ["-1"];
	let line = -1;
	let column = -1;

	match = string.match(regexLineDigitColumnDigit);
	if (match) {
		line = Number.parseInt(match[2], 10);
		column = Number.parseInt(match[3], 10);
		if (!Number.isNaN(line) && !Number.isNaN(column)) return { line, column };
	}

	match = string.match(regexLineCharacterLineDigitColumnDigit);
	if (match) {
		line = Number.parseInt(match[1], 10);
		column = Number.parseInt(match[2], 10);
		if (!Number.isNaN(line) && !Number.isNaN(column)) return { line, column };
	}

	match = string.match(regexBracketsLineDotsColumn);
	if (match) {
		line = Number.parseInt(match[1], 10);
		column = Number.parseInt(match[2], 10);
		if (!Number.isNaN(line) && !Number.isNaN(column)) return { line, column };
	}

	return { line: -1, column: -1 };
}

/**
 * @param {Error} error
 */
function createDiagnosticFromError(error) {
	let { line, column } = strExtractLineColumn(error.message);
	if (line === -1 || column === -1) {
		// creating a new position require values greater than -1
		line = 1;
		column = 1;
	}
	const range = new vscode.Range(
		new vscode.Position(line - 1, column), // position is zero indexed
		new vscode.Position(line - 1, column),
	);

	const diagnostic = new vscode.Diagnostic(
		range,
		error.message,
		vscode.DiagnosticSeverity.Error,
	);

	return diagnostic;
}

/**
 * @param {string} command
 * @param {string} text
 * @param {boolean} show
 * @param {string} tooltip
 * @param {vscode.StatusBarAlignment} statusBarAlignment
 * @param {number} statusBarPriority
 */
function createStatusBarItem(
	command,
	text,
	show = true,
	tooltip = "",
	statusBarAlignment = vscode.StatusBarAlignment.Left,
	statusBarPriority = 0,
) {
	const statusBarItem = vscode.window.createStatusBarItem(
		statusBarAlignment,
		statusBarPriority,
	);
	statusBarItem.command = command;
	statusBarItem.text = text;
	statusBarItem.tooltip = tooltip;
	if (show) statusBarItem.show();
	else statusBarItem.hide();
	return statusBarItem;
}

// WARN cjs as vscode in the last version 1.91 don't support esm native
// export {
module.exports = {
	getCurrentInfo,
	getStoreDirPathAsync,

	readDirAsync,

	readFileAsync,
	readFileInStoreAsync,

	writeFileAsync,
	writeFileInStoreAsync,

	getTemplateStringInfoAsync,

	getCompletionListFromFilePathAsync,
	completionItemsExpliciter,

	strExtractLineColumn,
	createDiagnosticFromError,

	createStatusBarItem,

	createJsxDiagnosticWithSwcFromContentInRange,
	createJsxDiagnosticWithBabelFromContentInRange,
};

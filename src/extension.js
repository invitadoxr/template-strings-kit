const vscode = require("vscode");
const path = require("node:path");

const {
	getStoreDirPathAsync,
	writeFileAsync,
	getTemplateStringInfoAsync,
	getCompletionListFromFilePathAsync,
	completionItemsExpliciter,
	readFileAsync,
	createJsxDiagnosticWithBabelFromContentInRange,
} = require("./vscode.js");

const diagColl = vscode.languages.createDiagnosticCollection("jsx");

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	// return
	try {
		const storeDirPath = await getStoreDirPathAsync(context, true);

		const htmlPathJoined = path.join(storeDirPath, "html-emmet-provider.html");
		const htmlPath = path.normalize(htmlPathJoined);
		await readFileAsync(htmlPath, true);

		const cssPathJoined = path.join(storeDirPath, "css-emmet-provider.css");
		const cssPath = path.normalize(cssPathJoined);
		await readFileAsync(cssPath, true);

		const jsxPathJoined = path.join(storeDirPath, "jsx-emmet-provider.jsx");
		const jsxPath = path.normalize(jsxPathJoined);
		await readFileAsync(jsxPath, true);

		const languagePrefixPattern =
			/\/\*\s*(html|htmx|html5|css|style|stylesheet|jsx)\s*\*\/\s*`/g;

		context.subscriptions.push(diagColl);

		// sync files
		// jsx diagnostics
		vscode.workspace.onDidChangeTextDocument(async (ev) => {
			const ate = vscode.window.activeTextEditor;
			const doc = ev.document;
			const pos = ate.selection.active;
			if (doc.languageId !== "javascript" || ate.document !== doc) return null;

			const { content, isInside, relativePosition, language, range } =
				await getTemplateStringInfoAsync(doc, pos, languagePrefixPattern);
			if (!isInside) return null;

			const filePath =
				language === "html" ? htmlPath : language === "jsx" ? jsxPath : cssPath;
			await writeFileAsync(filePath, content);

			if (language !== "jsx") return null; // diagnostics only for jsx
			await createJsxDiagnosticWithBabelFromContentInRange(
				diagColl,
				doc,
				content,
				range,
			);
		});

		// autocomplete
		const disposableAutoComplete =
			vscode.languages.registerCompletionItemProvider(
				{ scheme: "file", language: "javascript" },
				{
					async provideCompletionItems(document, position, token, context) {
						const { content, isInside, relativePosition, language, range } =
							await getTemplateStringInfoAsync(
								document,
								position,
								languagePrefixPattern,
							);
						if (!isInside) return null;
						const filePath =
							language === "html"
								? htmlPath
								: language === "jsx"
									? jsxPath
									: cssPath;

						const completionList = await getCompletionListFromFilePathAsync(
							filePath,
							content,
							relativePosition,
						);

						if (completionList.items.length === 0) {
							console.error("Erx. completionList. cannot reach hints");
							return null;
						}

						const items = completionItemsExpliciter(completionList.items);
						return items;
					},
				},
				"",
			);
		context.subscriptions.push(disposableAutoComplete);
	} catch (e) {
		console.error("Erx. General. ", e);
	}
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};

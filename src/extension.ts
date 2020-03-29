import { format, parse } from "path";
import * as vscode from "vscode";
import { workspace } from "vscode";
import {
  MarkdownCompletionProvider,
  markdownCompletionTriggerChars
} from "./completions";
import { MarkdownSnippetCompletionItemProvider } from "./snippets";

/* TODO(lukemurray): ideas
- codelens for actions on links (https://code.visualstudio.com/api/references/vscode-api#CodeLens)
- decorations for references inline (https://code.visualstudio.com/api/references/vscode-api#DecorationInstanceRenderOptions)
- codeAction for missing wiki style links (https://code.visualstudio.com/api/references/vscode-api#CodeActionProvider)
  - https://github.com/microsoft/vscode-extension-samples/tree/master/code-actions-sample
- rename provider for links, tags, people, etc
- document link provider for wiki links https://code.visualstudio.com/api/references/vscode-api#DocumentLink
*/

/* TODO(lukemurray): tasks
- refactor completions to be lazy (this applies to file completions too)
  - Events to be aware of
    - onDidChangeTextDocument to search for changes (i.e. only in range that got replaced)
    - onDidRenameFiles
    - onDidDeleteFiles
    - onDidCreateFiles
  - basic model will be
    - 1. on load get all the completions across the workspace
    - 2. on any of the changes refresh the completions as necessary
- make code DRY
- pick up autoocompletions for wiki links from file contents, not just file names.
*/

class MarkdownDefinitionProvider implements vscode.DefinitionProvider {
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ) {
    const tagRegex = new RegExp(/(?<=(?:\s|^)(\[\[))([^\]\r\n]+)(?=\]\])/, "g");
    const matchGroup = 2;
    // get the range of the current tag autocomplete
    const range = document.getWordRangeAtPosition(position, tagRegex);
    // if not in a tag we're done
    if (range === undefined) {
      return undefined;
    }
    const selectedWord = document.getText(range);
    const sluggedFileName = selectedWord
      .replace(/[^\w\s-]/g, "") // Remove non-ASCII characters
      .trim()
      .replace(/\s+/g, "-") // Convert whitespace to hyphens
      .toLowerCase();
    const files = (await workspace.findFiles("**/*")).filter(
      f =>
        f.scheme == "file" &&
        f.path.match(/\.(md)/i) &&
        parse(f.path).name === sluggedFileName
    );
    // TODO(lukemurray): should parametrize wiki path so wiki files can be edited even without a root path or when open in another project
    if (files.length === 0) {
      // undefined in root path is undefined
      const rootURI = workspace.workspaceFolders?.[0].uri;
      const newPath = format({
        dir: rootURI?.fsPath,
        base: sluggedFileName + ".md"
      });
      const newURI = vscode.Uri.file(newPath);
      // TODO(lukemurray): create initial content
      await workspace.fs.writeFile(newURI, Buffer.from("# " + selectedWord));
      files.push(newURI);
    }
    const p = new vscode.Position(0, 0);
    return new vscode.Location(files[0], p);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const md = { scheme: "file", language: "markdown" };
  vscode.languages.setLanguageConfiguration("markdown", {
    wordPattern: /([\+\@\#\.\/\\\w]+)/
  });
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      md,
      new MarkdownCompletionProvider(),
      ...markdownCompletionTriggerChars
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      md,
      new MarkdownDefinitionProvider()
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      md,
      new MarkdownSnippetCompletionItemProvider()
    )
  );
}

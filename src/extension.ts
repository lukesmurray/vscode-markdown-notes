import * as vscode from "vscode";
import {
  MarkdownCompletionProvider,
  markdownCompletionTriggerChars,
  MarkdownDefinitionProvider
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
- refactor completions to be lazy
  - Events to be aware of
    - onDidChangeTextDocument to search for changes (i.e. only in range that got replaced)
    - onDidRenameFiles
    - onDidDeleteFiles
    - onDidCreateFiles
  - basic model will be
    - 1. on load get all the completions across the workspace
    - 2. on any of the changes refresh the completions as necessary
- make code DRY
*/

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

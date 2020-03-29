import { format, parse } from "path";
import * as vscode from "vscode";
import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  Position,
  TextDocument,
  workspace
} from "vscode";

/* TODO(lukemurray): ideas
- codelens for actions on links (https://code.visualstudio.com/api/references/vscode-api#CodeLens)
- decorations for references inline (https://code.visualstudio.com/api/references/vscode-api#DecorationInstanceRenderOptions)
- codeAction for missing wiki style links (https://code.visualstudio.com/api/references/vscode-api#CodeActionProvider)
  - https://github.com/microsoft/vscode-extension-samples/tree/master/code-actions-sample
- rename provider for links, tags, people, etc
- document link provider for wiki links https://code.visualstudio.com/api/references/vscode-api#DocumentLink
*/

/* TODO(lukemurray): tasks
- refactor autocomplete for people, tags, etc to search across all files in workspace
- refactor completions to be lazy (this applies to file completions too)
  - Events to be aware of
    - onDidChangeTextDocument to search for changes (i.e. only in range that got replaced)
    - onDidRenameFiles
    - onDidDeleteFiles
    - onDidCreateFiles
  - basic model will be
    - 1. on load get all the completions across the workspace
    - 2. on any of the changes refresh the completions as necessary
- move snippets to their own file
- make code DRY
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

class MarkdownFileCompletionItemProvider implements CompletionItemProvider {
  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ) {
    const tagRegex = new RegExp(/(?<=(?:\s|^)(\[\[))([^\]\r\n]+)(?=\]\])/, "g");
    const incompleteTagRegex = new RegExp(
      /(?<=(?:\s|^)(\[\[))([^\]\r\n]*)/,
      "g"
    );
    const matchGroup = 2;
    // get the range of the current tag autocomplete
    const range = document.getWordRangeAtPosition(position, incompleteTagRegex);
    // if not in a tag we're done
    if (range === undefined) {
      return undefined;
    }

    const files = (await workspace.findFiles("**/*")).filter(
      f => f.scheme == "file" && f.path.match(/\.(md)/i)
    );
    return files.map(
      // parse and name gets just the name from the file path (i.e. index)
      file => new CompletionItem(parse(file.path).name, CompletionItemKind.File)
    );
  }
}

function MetaDataCompletionItemProviderHelper(
  document: TextDocument,
  position: Position,
  tagRegex: RegExp,
  incompleteTagRegex: RegExp,
  matchGroup: number
) {
  // get the range of the current tag autocomplete
  const range = document.getWordRangeAtPosition(position, incompleteTagRegex);
  // if not in a tag we're done
  if (range === undefined) {
    return undefined;
  }

  const currentLineNumber = position.line;
  const tags = new Set<string>();
  // iterate over lines to create the set
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const line = document.lineAt(lineNumber);
    // slice out the current range from the extraction text
    const lineText =
      lineNumber !== currentLineNumber
        ? line.text
        : line.text.slice(0, range.start.character) +
          line.text.slice(range.end.character);
    let match;
    while ((match = tagRegex.exec(lineText)) !== null) {
      tags.add(match[matchGroup]);
    }
  }

  const hasWhiteSpaceAfter = /\s/.test(
    document.lineAt(range.end.line).text.charAt(range.end.character)
  );
  return [...tags].sort().map(tag => {
    const completionItem = new CompletionItem(tag, CompletionItemKind.Value);
    completionItem.insertText = tag + (hasWhiteSpaceAfter ? "" : " ");
    return completionItem;
  });
}

class MarkdownPersonCompletionItemProvider implements CompletionItemProvider {
  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ) {
    const tagRegex = new RegExp(/(?<=\s|^)(@[\w\-\_]+)/, "g");
    const incompleteTagRegex = new RegExp(/(?<=\s|^)(@[\w\-\_]*)/, "g");
    const matchGroup = 1;
    return MetaDataCompletionItemProviderHelper(
      document,
      position,
      tagRegex,
      incompleteTagRegex,
      matchGroup
    );
  }
}

class MarkdownProjectCompletionProvider implements CompletionItemProvider {
  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ) {
    const tagRegex = new RegExp(/(?<=\s|^)(\+[\w\-\_]+)/, "g");
    const incompleteTagRegex = new RegExp(/(?<=\s|^)(\+[\w\-\_]*)/, "g");
    const matchGroup = 1;
    return MetaDataCompletionItemProviderHelper(
      document,
      position,
      tagRegex,
      incompleteTagRegex,
      matchGroup
    );
  }
}

class MarkdownTagCompletionProvider implements CompletionItemProvider {
  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ) {
    // regex to match tags
    const tagRegex = new RegExp(/(?<=\s|^)(#[\w\-\_]+)/, "g");
    const incompleteTagRegex = new RegExp(/(?<=\s|^)(#[\w\-\_]*)/, "g");
    const matchGroup = 1;
    return MetaDataCompletionItemProviderHelper(
      document,
      position,
      tagRegex,
      incompleteTagRegex,
      matchGroup
    );
  }
}

class MarkdownSnippetCompletionItemProvider implements CompletionItemProvider {
  public async provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ) {
    const taskSnippet = new vscode.CompletionItem("task");
    taskSnippet.insertText = new vscode.SnippetString(
      "- [ ] ${1:What do you want to do?} ${2:+project} est:${3:30m} took:- added:$CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE id:$RANDOM_HEX"
    );
    taskSnippet.documentation = new vscode.MarkdownString("Create a new task.");
    const randomSnippet = new vscode.CompletionItem("random");
    randomSnippet.insertText = new vscode.SnippetString("$RANDOM_HEX");
    randomSnippet.documentation = new vscode.MarkdownString(
      "Insert a random value. (random hex)"
    );
    const dateSnippet = new vscode.CompletionItem("date");
    dateSnippet.insertText = new vscode.SnippetString(
      "# $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE\n\n$0"
    );
    dateSnippet.documentation = new vscode.MarkdownString(
      "Insert the current date"
    );
    const meetingSnippet = new vscode.CompletionItem("meeting");
    meetingSnippet.insertText = new vscode.SnippetString(
      "[[$CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE Meeting ${1:about} $0]]"
    );
    meetingSnippet.documentation = new vscode.MarkdownString(
      "Insert a new meeting"
    );
    const memoSnippet = new vscode.CompletionItem("memo");
    memoSnippet.insertText = new vscode.SnippetString(
      "[[$CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE Memo ${1:about} $0]]"
    );
    memoSnippet.documentation = new vscode.MarkdownString("Insert a new memo");
    const dueSnippet = new vscode.CompletionItem("due");
    dueSnippet.insertText = new vscode.SnippetString(
      "due:${1:$CURRENT_YEAR}-${2:$CURRENT_MONTH}-${3:$CURRENT_DATE}"
    );
    dueSnippet.documentation = new vscode.MarkdownString("Insert a due datee");

    return [
      taskSnippet,
      randomSnippet,
      dateSnippet,
      meetingSnippet,
      memoSnippet,
      dueSnippet
    ];
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
      new MarkdownFileCompletionItemProvider(),
      "["
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      md,
      new MarkdownPersonCompletionItemProvider(),
      "@"
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      md,
      new MarkdownProjectCompletionProvider(),
      "+"
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      md,
      new MarkdownTagCompletionProvider(),
      "#"
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

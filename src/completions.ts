import { format, parse } from "path";
import * as vscode from "vscode";
import {
  extractMatchesLineProcessingStrategy,
  getWorkspaceMarkdownDocuments,
  getWorkspaceMarkdownFiles,
  processDocumentLineByLine,
  processFileLineByLine,
  readFirstLine
} from "./util";

/**
 * Based interface for markdown completion strategies
 */
interface IMarkdownCompletionStrategy {
  /**
   * the type of the completion. This is the discriminant in the Algebraic Type MarkdownCompletionStrategy
   */
  type: string;
  /**
   * the trigger character for the strategy if there is a trigger character.
   */
  triggerChar?: string;
  /**
   * the regex passed to getWordRangeAtPosition to determine if the current position matches the strategy.
   *
   * The first strategy for which this check passes is used for completions.
   */
  rangeCheckRegex: RegExp;
  /**
   * the regex used to extract matches from lines of the document.
   * the regex cannot traverse multiple lines
   */
  matchRegex: RegExp;
  /**
   * the group of the match regex which contains the text to be used for the completion item label.
   */
  matchGroup: number;
  /**
   * the kind of completion to use for the strategy
   */
  completionKind: vscode.CompletionItemKind;
  // TODO(lukemurray): this is a bit of a dirty generic
  /**
   * extra strategy used to define completions which are not covered by the generic case
   */
  additionalStrategy: (() => Promise<string[]>) | undefined;
}

/**
 * Example Regex Design for Person/Tag/Project
 * /(?<=\s|^)(@[^\#\@\+\[\]\s]+)/
 *
 * (?<=\s|^) is a positive lookbehind which matches whitespace or newline
 * (@ matches the special trigger character @ for person
 * [^\#\@\+\[\]\s] matches all the characters not in this list. the list is
 *                  comprised of special markdown trigger characters from this
 *                  extension and white space.
 * + is a quantifier saying match at least one character. For range checks we
 *    only need the trigger after a newline or space so this is replaced with *
 *
 * The trigger character @ is part of the extracted matchGroup because @ is a
 * word character so the completion has to contain @ since it is the start of
 * the word.
 *
 * The same logic is used for Tags and Projects but with a different special
 * character.
 */

/**
 * Example Regex Design for Wiki Link
 * /(?<=(?:\s|^)(\[\[))([^\]\r\n]+)(?=\]\])/
 *
 * (?<=\s|^) is a positive lookbehind which matches whitespace or newline
 * (\[\[)) matches the trigger characters [[
 * ([^\]\r\n]+) matches all characters except ] one or more times
 * (?=\]\]) is a positive look ahead for the closing ]]. The closing bracket is
 *          not included in the partial match.
 *
 * The trigger character [ is not part of the extracted match group because [ is
 * not a word character so the completion cannot contain [ since [ is not the
 * start of the word.
 */

class MarkdownCompletionStrategyPerson implements IMarkdownCompletionStrategy {
  readonly type = "person";
  readonly trigger = "@";
  readonly rangeCheckRegex = new RegExp(/(?<=\s|^)(@[^\#\@\+\[\]\s]*)/, "g");
  readonly matchRegex = new RegExp(/(?<=\s|^)(@[^\#\@\+\[\]\s]+)/, "g");
  readonly matchGroup = 1;
  readonly completionKind = vscode.CompletionItemKind.Value;
  readonly additionalStrategy: undefined;
}

class MarkdownCompletionStrategyTag implements IMarkdownCompletionStrategy {
  readonly type = "tag";
  readonly trigger = "#";
  readonly rangeCheckRegex = new RegExp(/(?<=\s|^)(#[^\#\@\+\[\]\s]*)/, "g");
  readonly matchRegex = new RegExp(/(?<=\s|^)(#[^\#\@\+\[\]\s]+)/, "g");
  readonly matchGroup = 1;
  readonly completionKind = vscode.CompletionItemKind.Value;
  readonly additionalStrategy: undefined;
}

class MarkdownCompletionStrategyProject implements IMarkdownCompletionStrategy {
  readonly type = "project";
  readonly trigger = "+";
  readonly rangeCheckRegex = new RegExp(/(?<=\s|^)(\+[^\#\@\+\[\]\s]*)/, "g");
  readonly matchRegex = new RegExp(/(?<=\s|^)(\+[^\#\@\+\[\]\s]+)/, "g");
  readonly matchGroup = 1;
  readonly completionKind = vscode.CompletionItemKind.Value;
  readonly additionalStrategy: undefined;
}

class MarkdownCompletionStrategyWikiLink
  implements IMarkdownCompletionStrategy {
  readonly type = "wikiLink";
  readonly trigger = "[";
  readonly rangeCheckRegex = new RegExp(/(?<=(?:\s|^)(\[\[))([^\]\r\n]*)/, "g");
  readonly matchRegex = new RegExp(
    /(?<=(?:\s|^)(\[\[))([^\]\r\n]+)(?=\]\])/,
    "g"
  );
  readonly matchGroup = 2;
  readonly completionKind = vscode.CompletionItemKind.File;
  readonly additionalStrategy = async () => {
    const files = await getWorkspaceMarkdownFiles();
    const names = await Promise.all(
      files.map(async f => {
        const firstLine = await readFirstLine(f);
        if (firstLine.startsWith("# ")) {
          return firstLine.slice(2);
        }
        return parse(f.path).name;
      })
    );
    return names;
  };
}

type MarkdownCompletionStrategy =
  | MarkdownCompletionStrategyPerson
  | MarkdownCompletionStrategyProject
  | MarkdownCompletionStrategyTag
  | MarkdownCompletionStrategyWikiLink;

// interface MarkdownCompletionStore {}
const markdownCompletionStrategies: MarkdownCompletionStrategy[] = [
  new MarkdownCompletionStrategyPerson(),
  new MarkdownCompletionStrategyTag(),
  new MarkdownCompletionStrategyProject(),
  new MarkdownCompletionStrategyWikiLink()
];

export const markdownCompletionTriggerChars = markdownCompletionStrategies.map(
  strategy => strategy.trigger
);

export class MarkdownCompletionProvider
  implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) {
    let range: vscode.Range | undefined;
    let foundStrategy: MarkdownCompletionStrategy | undefined;
    for (let strategy of markdownCompletionStrategies) {
      range = document.getWordRangeAtPosition(
        position,
        strategy.rangeCheckRegex
      );
      if (range === undefined) {
        continue;
      }
      foundStrategy = strategy;
      break;
    }

    if (foundStrategy === undefined || range === undefined) {
      return;
    }

    const openDocuments = await getWorkspaceMarkdownDocuments();
    const documentNameSet = new Set(openDocuments.map(doc => doc.fileName));
    const files = (await getWorkspaceMarkdownFiles()).filter(
      f => documentNameSet.has(f.fsPath) === false
    );
    const outputMatches: string[] = [];
    const matchingStrategy = extractMatchesLineProcessingStrategy(
      foundStrategy!.matchRegex,
      foundStrategy!.matchGroup,
      outputMatches
    );
    await Promise.all(
      files.map(file => processFileLineByLine(file, matchingStrategy))
    );
    await Promise.all(
      openDocuments.map(document =>
        processDocumentLineByLine(document, matchingStrategy)
      )
    );
    if (foundStrategy.additionalStrategy !== undefined) {
      outputMatches.push(...(await foundStrategy.additionalStrategy()));
    }
    return [...new Set(outputMatches)]
      .sort()
      .map(
        match => new vscode.CompletionItem(match, foundStrategy?.completionKind)
      );
  }
}

export class MarkdownDefinitionProvider implements vscode.DefinitionProvider {
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ) {
    let range: vscode.Range | undefined;
    let foundStrategy: MarkdownCompletionStrategy | undefined;
    for (let strategy of markdownCompletionStrategies) {
      range = document.getWordRangeAtPosition(position, strategy.matchRegex);
      if (range === undefined) {
        continue;
      }
      foundStrategy = strategy;
      break;
    }

    if (foundStrategy === undefined || range === undefined) {
      return;
    }

    const selectedWord = document.getText(range);
    const sluggedFileName = selectedWord
      .replace(/[^\w\s-]/g, "") // Remove non-ASCII characters
      .trim()
      .replace(/\s+/g, "-") // Convert whitespace to hyphens
      .toLowerCase();
    const files = await getWorkspaceMarkdownFiles().then(f =>
      f.filter(f => parse(f.path).name === sluggedFileName)
    );
    if (files.length === 0 && vscode.workspace.workspaceFolders !== undefined) {
      const rootURI = vscode.workspace.workspaceFolders?.[0].uri;
      const newPath = format({
        dir: rootURI?.fsPath,
        base: sluggedFileName + ".md"
      });
      const newURI = vscode.Uri.file(newPath);
      await vscode.workspace.fs.writeFile(
        newURI,
        Buffer.from("# " + selectedWord)
      );
      files.push(newURI);
    }
    const p = new vscode.Position(0, 0);
    return new vscode.Location(files[0], p);
  }
}

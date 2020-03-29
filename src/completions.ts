import * as vscode from "vscode";
import {
  processLineByLine,
  extractMatchesLineProcessingStrategy,
  processDocumentLineByLine,
  getWorkspaceMarkdownFiles,
  readFirstLine,
  getWorkspaceMarkdownDocuments
} from "./util";
import { parse } from "path";

interface IMarkdownCompletionStrategy {
  type: string;
  triggerChar?: string;
  rangeCheckRegex: RegExp;
  matchRegex: RegExp;
  matchGroup: number;
  completionKind: vscode.CompletionItemKind;
  additionalStrategy: (() => Promise<string[]>) | undefined;
}

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
      files.map(file => processLineByLine(file, matchingStrategy))
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

import * as fs from "fs";
import * as vscode from "vscode";
import * as readline from "readline";
import { once } from "events";

/**
 * Read the first line from the passed in file.
 * @param fileUri the uri of the file to read a line from
 */
export async function readFirstLine(fileUri: vscode.Uri) {
  const opts = {
    encoding: "utf8",
    lineEnding: "\n"
  };
  // implementation stolen from firstLine package
  return new Promise<string>((resolve, reject) => {
    if (fileUri.scheme !== "file") {
      reject(new Error("uri passed to readFirstLine must be a file."));
    }
    const rs = fs.createReadStream(fileUri.fsPath, {
      encoding: opts.encoding
    });
    let acc = "";
    let pos = 0;
    let index;
    rs.on("data", chunk => {
      index = chunk.indexOf(opts.lineEnding);
      acc += chunk;
      if (index === -1) {
        pos += chunk.length;
      } else {
        pos += index;
        rs.close();
      }
    })
      .on("close", () =>
        resolve(acc.slice(acc.charCodeAt(0) === 0xfeff ? 1 : 0, pos))
      )
      .on("error", err => reject(err));
  });
}

/**
 * Process each line of a file. Returns when entire file has been processed
 * @param fileUri the uri of the file to process lines from
 * @param callback callback called on each line of the file, the first argument is the line as a string.
 */
export async function processLineByLine(
  fileUri: vscode.Uri,
  callback: (line: string, lineNumber: number) => void
) {
  if (fileUri.scheme !== "file") {
    throw new Error("uri passed to readFirstLine must be a file.");
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(fileUri.fsPath),
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  rl.on("line", line => callback(line, lineNumber++));

  await once(rl, "close");
}

export async function processDocumentLineByLine(
  document: vscode.TextDocument,
  callback: (line: string, lineNumber: number) => void
) {
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const line = document.lineAt(lineNumber);
    callback(line.text, lineNumber);
  }
}

export function extractMatchesLineProcessingStrategy(
  regex: RegExp,
  matchGroup: number,
  outputMatches: string[],
  omit?: vscode.Range
) {
  return (line: string, lineNumber: number) => {
    if (omit !== undefined && omit.start.line === lineNumber) {
      line =
        line.slice(0, omit.start.character) + line.slice(omit.end.character);
    }
    let match;
    while ((match = regex.exec(line)) !== null) {
      outputMatches.push(match[matchGroup]);
    }
  };
}

export async function getWorkspaceMarkdownFiles() {
  return (await vscode.workspace.findFiles("**/*")).filter(
    f => f.scheme == "file" && f.path.match(/\.(md)$/i)
  );
}

export async function getWorkspaceMarkdownDocuments() {
  return vscode.workspace.textDocuments.filter(f =>
    f.fileName.match(/\.(md)$/i)
  );
}

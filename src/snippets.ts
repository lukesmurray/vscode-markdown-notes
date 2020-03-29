import * as vscode from "vscode";

export class MarkdownSnippetCompletionItemProvider
  implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) {
    const currentDateVariable = "$CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE";
    const randomIdVariable = "$RANDOM_HEX";

    // snippet for creating a new task with tags that reschedule can understand.
    const taskSnippet = new vscode.CompletionItem("task");
    taskSnippet.insertText = new vscode.SnippetString(
      "- [ ] ${1:What do you want to do?} ${2:+project} est:${3:30m} took:- added:" +
        currentDateVariable +
        " id:" +
        randomIdVariable +
        ""
    );
    taskSnippet.documentation = new vscode.MarkdownString(
      "Create a new task with tags that reschedule can understand"
    );

    // snippet for creating a new random id.
    const randomSnippet = new vscode.CompletionItem("random");
    randomSnippet.insertText = new vscode.SnippetString(randomIdVariable);
    randomSnippet.documentation = new vscode.MarkdownString(
      "Insert a new random id"
    );

    // snippet for inserting the current date as a heading.
    const dateSnippet = new vscode.CompletionItem("date");
    dateSnippet.insertText = new vscode.SnippetString(
      "# " + currentDateVariable + "\n\n$0"
    );
    dateSnippet.documentation = new vscode.MarkdownString(
      "Insert the current date as a heading."
    );

    // snippet for creating a new meeting as a wiki link
    const meetingSnippet = new vscode.CompletionItem("meeting");
    meetingSnippet.insertText = new vscode.SnippetString(
      "[[" + currentDateVariable + " Meeting ${1:about} $0]]"
    );
    meetingSnippet.documentation = new vscode.MarkdownString(
      "Insert a new meeting as a wiki link."
    );

    // snippet for creating a memo as a wiki link
    const memoSnippet = new vscode.CompletionItem("memo");
    memoSnippet.insertText = new vscode.SnippetString(
      "[[" + currentDateVariable + " Memo ${1:about} $0]]"
    );
    memoSnippet.documentation = new vscode.MarkdownString(
      "Insert a new memo as a wiki link."
    );

    // snippet for adding a key value pair for a due date
    const dueSnippet = new vscode.CompletionItem("due");
    dueSnippet.insertText = new vscode.SnippetString(
      "due:${1:$CURRENT_YEAR}-${2:$CURRENT_MONTH}-${3:$CURRENT_DATE}"
    );
    dueSnippet.documentation = new vscode.MarkdownString(
      "Insert a due date as a key value pair."
    );

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

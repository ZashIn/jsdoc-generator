import * as vscode from 'vscode';
import {CompletionItem, TextDocument, Position, CancellationToken, ExtensionContext, Range, CompletionItemKind, Uri} from 'vscode';

import {JsdocGenerator} from './JsdocGenerator';
import {TextFile} from './TextFile';

/**
 * JsdocGenerator object.
 *
 * @type {JsdocGenerator}
 */
let jsdocGenerator: JsdocGenerator;

/**
 * Summarized infos of a parameter.
 *
 * @interface SummarizedParameter
 * @typedef {SummarizedParameter}
 */
interface SummarizedParameter {
  /**
   * Parameter name.
   *
   * @type {string}
   */
  name: string;
  /**
   * Parameter type.
   *
   * @type {string}
   */
  type: string;
}

/**
 * Available languages.
 *
 * @typedef {Language}
 */
type Language = 'English'
  | 'Mandarin Chinese'
  | 'Spanish'
  | 'Hindi'
  | 'Portuguese'
  | 'Russian'
  | 'Japanese'
  | 'Yue Chinese'
  | 'Turkish'
  | 'Wu Chinese'
  | 'Korean'
  | 'French'
  | 'German'
  | 'Italian'
  | 'Arabic'
  | 'Greek';

/**
 * JSDoc custom tag.
 *
 * @interface CustomTag
 * @typedef {CustomTag}
 */
interface CustomTag {
  /**
   * Tag name.
   *
   * @type {string}
   */
  tag: string;
  /**
   * Tag value placeholder.
   *
   * @type {?string}
   */
  placeholder?: string;
}

/**
 * Configuration type map.
 *
 * @interface Configuration
 * @typedef {Configuration}
 */
interface Configuration {
  /**
   * JSDoc description placeholder.
   *
   * @type {string}
   */
  descriptionPlaceholder: string;
  /**
   * JSDoc Author.
   *
   * @type {string}
   */
  author: string;
  /**
   * Whether to include the date in JSDocs.
   *
   * @type {boolean}
   */
  includeDate: boolean;
  /**
   * Whether to include the time in JSDocs.
   *
   * @type {boolean}
   */
  includeTime: boolean;
  /**
   * Whether to include types in JSDocs.
   *
   * @type {boolean}
   */
  includeTypes: boolean;
  /**
   * Whether to include parenthesis for multiple types in JSDocs.
   *
   * @type {boolean}
   */
  includeParenthesisForMultipleTypes: boolean;
  /**
   * JSDoc constructors decription.
   *
   * @type {string}
   */
  descriptionForConstructors: string;
  /**
   * Whether to create JSDoc for function variables as for normal functions.
   *
   * @type {boolean}
   */
  functionVariablesAsFunctions: boolean;
  /**
   * Whether to include the export tag in JSDocs.
   *
   * @type {boolean}
   */
  includeExport: boolean;
  /**
   * Whether to include the async tag in JSDocs.
   *
   * @type {boolean}
   */
  includeAsync: boolean;
  /**
   * JSDoc custom tags.
   *
   * @type {CustomTag[]}
   */
  customTags: CustomTag[];
  /**
   * Starting point of the column containing the tag value.
   *
   * @type {number}
   */
  tagValueColumnStart: number;
  /**
   * Starting point of the column containing the tag name value.
   *
   * @type {number}
   */
  tagNameColumnStart: number;
  /**
   * Starting point of the column containing the tag description.
   *
   * @type {number}
   */
  tagDescriptionColumnStart: number;
  /**
   * Generative AI API key.
   *
   * @type {string}
   */
  generativeApiKey: string;
  /**
   * Generative AI model.
   *
   * @type {('gpt-3.5-turbo' | 'gpt-4')}
   */
  generativeModel: 'gpt-3.5-turbo' | 'gpt-4';
  /**
   * Language of the generated descriptions.
   *
   * @type {Language}
   */
  generativeLanguage: Language;
  /**
   * When using AI generation, generate descriptions for type parameters (generics) too.  
   * When enabled, makes JSDoc generation slower and use more API calls.
   *
   * @type {boolean}
   */
  generateDescriptionForTypeParameters: boolean;
  /**
   * When using AI generation, generate descriptions for method parameters too.  
   * When enabled, makes JSDoc generation slower and use more API calls.
   *
   * @type {boolean}
   */
  generateDescriptionForParameters: boolean;
  /**
   * When using AI generation, generate descriptions for method return values too.  
   * When enabled, makes JSDoc generation slower and use more API calls.
   *
   * @type {boolean}
   */
  generateDescriptionForReturns: boolean;
}

/**
 * JSDoc Autocompletion item.
 *
 * @class
 * @typedef {JsdocCompletionItem}
 * @extends {CompletionItem}
 */
class JsdocCompletionItem extends CompletionItem {
  /**
   * @constructor
   * @param {string} line
   * @param {Position} position
   */
  constructor(line: string, position: Position) {
    super('/** Autogenerated JSDoc */', CompletionItemKind.Snippet);
    this.insertText = '';
    this.sortText = '\0';
    this.range = this.retrieveRange(line, position);
    this.command = {
      title: 'Generate JSDoc',
      command: 'jsdoc-generator.generateJsdoc'
    };
  }

  /**
   * Retrieves the range of the JSDoc comment from the current line and the {@link Position} parameter.
   *
   * @private
   * @param {string} line
   * @param {Position} position
   * @returns {Range}
   */
  private retrieveRange(line: string, position: Position): Range {
    const prefix = line.slice(0, position.character).match(/\/\**\s*$/);
    const suffix = line.slice(position.character).match(/^\s*\**\//);
    const start = position.translate(0, prefix ? -prefix[0].length : 0);
    return new Range(start, position.translate(0, suffix ? suffix[0].length : 0));
  }
}

/**
 * Lazy instantiates the JsdocGenerator object.
 */
function lazyInstantiateJsdocGenerator() {
  if (!jsdocGenerator) {
    jsdocGenerator = new JsdocGenerator();
  }
}

/**
 * Supported languages.
 *
 * @type {string[]}
 */
const SUPPORTED_LANGUAGES: string[] = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact'
];

// Set in this extension context the supported languages.
vscode.commands.executeCommand('setContext', 'ext.supportedLanguages', SUPPORTED_LANGUAGES);

/**
 * Called when the extension is activated.
 * Subscribes the autocompletion item and the commands in the context.
 * Lazy initializes the JsdocGenerator object.
 *
 * @param {ExtensionContext} context
 */
function activate(context: ExtensionContext) {
  // Generates JSDoc with auto completion.
  const generateJsdocAutocompletion = vscode.languages.registerCompletionItemProvider(
    [
      {
        scheme: 'file',
        language: 'typescript'
      },
      {
        scheme: 'file',
        language: 'typescriptreact'
      },
      {
        scheme: 'file',
        language: 'javascript'
      },
      {
        scheme: 'file',
        language: 'javascriptreact'
      }
    ],
    {
      provideCompletionItems(document: TextDocument, position: Position, _: CancellationToken) {
        const line = document.lineAt(position.line).text;
        const prefix = line.slice(0, position.character);
        if (prefix.match(/^\s*\/\*\*\s*$/)) {
          return [new JsdocCompletionItem(line, position)];
        }
        return null;
      }
    },
    '/',
    '*'
  );
  // Generates JSDoc for the current selection.
  const generateJsdoc = vscode.commands.registerCommand('jsdoc-generator.generateJsdoc', () => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'JSDocGen (node)',
        cancellable: true
      },
      (progress, token) => {
        lazyInstantiateJsdocGenerator();
        if (vscode.window.activeTextEditor) {
          return jsdocGenerator.generateJsdoc(progress, token, vscode.window.activeTextEditor);
        }
        vscode.window.showErrorMessage('Unable to generate JSDoc: no editor has been selected.');
        return Promise.resolve();
      }
    );
  });
  // Generates JSDoc for every suitable element in the current file.
  const generateJsdocFile = vscode.commands.registerCommand('jsdoc-generator.generateJsdocFile', (file?: Uri) => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'JSDocGen (file)',
        cancellable: true
      },
      (progress, token) => {
        lazyInstantiateJsdocGenerator();
        if (file) {
          return jsdocGenerator.generateJsdocFile(progress, token, new TextFile(new vscode.WorkspaceEdit(), file));
        }
        if (vscode.window.activeTextEditor) {
          return jsdocGenerator.generateJsdocFile(progress, token, new TextFile(vscode.window.activeTextEditor));
        }
        vscode.window.showErrorMessage('Unable to generate JSDoc: no valid file has been selected.');
        return Promise.resolve();
      }
    );
  });
  // Generates JSDoc for every suitable element in every ts or js file in the selected folder.
  const generateJsdocFolder = vscode.commands.registerCommand('jsdoc-generator.generateJsdocFolder', (folder?: Uri) => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'JSDocGen (folder)',
        cancellable: true
      },
      (progress, token) => {
        lazyInstantiateJsdocGenerator();
        return jsdocGenerator.generateJsdocWorkspace(progress, token, folder);
      }
    );
  });
  // Generates JSDoc for every suitable element in every ts or js file in the workspace.
  const generateJsdocWorkspace = vscode.commands.registerCommand('jsdoc-generator.generateJsdocWorkspace', () => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'JSDocGen (workspace)',
        cancellable: true
      },
      (progress, token) => {
        lazyInstantiateJsdocGenerator();
        return jsdocGenerator.generateJsdocWorkspace(progress, token);
      }
    );
  });
  context.subscriptions.push(generateJsdoc, generateJsdocFile, generateJsdocFolder, generateJsdocWorkspace, generateJsdocAutocompletion);
}

/**
 * This method is called when the extension is deactivated.
 */
function deactivate() {
  // Empty on purpose.
}

/**
 * Returns the value of the specified configuration.
 *
 * @template {keyof Configuration} K
 * @param {K} property configuration property name, supports dotted names.
 * @param {Configuration[K]} defaultValue a value should be returned when no value could be found.
 * @returns {Configuration[K]} The value from the configuration or the default.
 */
function getConfig<K extends keyof Configuration>(property: K, defaultValue: Configuration[K]): Configuration[K] {
  return vscode.workspace.getConfiguration().get(`jsdoc-generator.${property}`, defaultValue);
}

export {SUPPORTED_LANGUAGES, activate, deactivate, getConfig, SummarizedParameter};

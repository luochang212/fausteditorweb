import * as monaco from "monaco-editor"; // eslint-disable-line import/no-unresolved
import { Faust2Doc, TFaustDocs, TFaustDoc } from "./Faust2Doc";

export type FaustLanguageProviders = {
    hoverProvider: monaco.languages.HoverProvider;
    tokensProvider: monaco.languages.IMonarchLanguage;
    completionItemProvider: monaco.languages.CompletionItemProvider;
    docs: TFaustDocs;
};
export const language: monaco.languages.ILanguageExtensionPoint = {
    id: "faust",
    extensions: ["dsp", "lib"],
    mimetypes: ["application/faust"]
};
export const config: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"]
    },
    brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
    ],
    autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string"] },
        { open: "/*", close: "*/", notIn: ["string"] }
    ]
};
export const theme: monaco.editor.IStandaloneThemeData = {
    base: "vs-dark",
    inherit: true,
    rules: [
        { token: "faustFunctions", foreground: "DDDD99" },
        { token: "faustKeywords", foreground: "4499CC" },
        { token: "faustLib", foreground: "CCCCBB" },
        { token: "faustCompOperators", foreground: "FFDDFF" },
        { token: "identifier", foreground: "77CCFF" }
    ],
    colors: null
};
const faustKeywords = [
    "import", "component", "declare", "library", "environment", "int", "float",
    "letrec", "with", "class", "process", "effect", "inputs", "outputs"
];
const faustFunctions = [
    "mem", "prefix", "rdtable", "rwtable",
    "select2", "select3", "ffunction", "fconstant", "fvariable",
    "button", "checkbox", "vslider", "hslider", "nentry",
    "vgroup", "hgroup", "tgroup", "vbargraph", "hbargraph", "attach",
    "acos", "asin", "atan", "atan2", "cos", "sin", "tan", "exp",
    "log", "log10", "pow", "sqrt", "abs", "min", "max", "fmod",
    "remainder", "floor", "ceil", "rint",
    "seq", "par", "sum", "prod"
];
const getFile = async (fileName: string) => {
    if (window.faust && window.faust.fs) {
        const fs = window.faust.fs;
        return fs.readFile("libraries/" + fileName, { encoding: "utf8" });
    }
    const libPath = "https://faust.grame.fr/tools/editor/libraries/";
    const res = await fetch(libPath + fileName);
    return res.text();
};
type TMatchedFaustDoc = { nameArray: string[]; name: string; range: monaco.Range; doc: TFaustDoc };
/**
 * Match an available doc key from monaco editor
 *
 * @param {TFaustDocs} doc
 * @param {monaco.editor.ITextModel} model
 * @param {monaco.Position} position
 * @returns {TMatchedFaustDoc} full: [...prefixes, name], range: a monaco range object, doc: a FaustDoc object
 */
export const matchDocKey = (doc: TFaustDocs, model: monaco.editor.ITextModel, position: monaco.Position): TMatchedFaustDoc => {
    const line$ = position.lineNumber;
    const line = model.getLineContent(line$);
    const wordAtPosition = model.getWordAtPosition(position);
    if (!wordAtPosition) return null;
    let column$ = wordAtPosition.startColumn - 1;
    const name = wordAtPosition.word;
    const prefixes: string[] = [];
    while (column$ - 2 >= 0 && line[column$ - 1] === ".") {
        column$ -= 2;
        const prefixWord = model.getWordAtPosition(new monaco.Position(line$, column$));
        prefixes.splice(0, 0, prefixWord.word);
        column$ = prefixWord.startColumn - 1;
    }
    const nameArray = [...prefixes, name];
    while (nameArray.length) {
        const name = nameArray.join(".");
        const e = doc[name];
        if (e) {
            return {
                nameArray,
                name,
                range: new monaco.Range(line$, column$ + 1, line$, wordAtPosition.endColumn),
                doc: e
            };
        }
        column$ += nameArray.splice(0, 1)[0].length + 1;
    }
    return null;
};
export const getProviders = async (): Promise<FaustLanguageProviders> => {
    let libDocs: TFaustDocs = {};
    let primDocs: TFaustDocs = {};
    try {
        libDocs = await Faust2Doc.parse("stdfaust.lib", getFile);
        primDocs = await Faust2Doc.parse("primitives.lib", async (fileName: string) => {
            const libPath = "./";
            const res = await fetch(libPath + fileName);
            return res.text();
        });
    } catch (e) { console.error(e); } // eslint-disable-line no-empty, no-console
    const faustLib = Object.keys(libDocs);
    const hoverProvider: monaco.languages.HoverProvider = {
        provideHover: (model, position) => {
            const matched = matchDocKey({ ...primDocs, ...libDocs }, model, position);
            if (matched) {
                const prefix = matched.nameArray.slice();
                const name = prefix.pop();
                const doc = matched.doc;
                return {
                    range: matched.range,
                    contents: [
                        { value: `\`\`\`\n${prefix.length ? "(" + prefix.join(".") + ".)" : ""}${name}\n\`\`\`` },
                        { value: doc.doc.replace(/#+/g, "######") },
                        { value: prefix.length ? `[Detail...](https://faust.grame.fr/doc/libraries/#${prefix.join(".") + "."}${doc.name.replace(/[[\]|]/g, "").toLowerCase()})` : "[Detail...](https://faust.grame.fr/doc/manual/index.html#faust-syntax)" }
                    ]
                };
            }
            return null;
        }
    };
    const tokensProvider: monaco.languages.IMonarchLanguage = ({
        faustKeywords,
        faustFunctions,
        faustLib,
        defaultToken: "invalid",
        tokenPostfix: ".dsp",
        faustCompOperators: [
            "~", ",", ":", "<:", ":>"
        ],
        operators: [
            "=",
            "+", "-", "*", "/", "%", "^",
            "&", "|", "xor", "<<", ">>",
            ">", "<", "==", "<=", ">=", "!=",
            "@", "'"
        ],
        // we include these common regular expressions
        symbols: /[=><!~?:&|+\-*/^%]+/,
        // C# style strings
        escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
        // The main tokenizer for our languages
        tokenizer: {
            root: [
                // identifiers and keywords
                [/!|_/, "keyword"],
                [/[a-z_$]([\w.$]*[\w$])?/, {
                    cases: {
                        "@faustFunctions": "faustFunctions",
                        "@faustKeywords": "faustKeywords",
                        "@faustLib": "faustLib",
                        "@default": "identifier"
                    }
                }],
                [/[A-Z][\w$]*/, "type.identifier"],
                // whitespace
                { include: "@whitespace" },
                // delimiters and operators
                [/[{}()[\]]/, "@brackets"],
                [/~|,|<:|:>|:/, "faustCompOperators"],
                [/[<>](?!@symbols)/, "@brackets"],
                [/=|\+|-|\*|\/|%|\^|&|\||xor|<<|>>|>|<|==|<=|>=|!=|@|'/, {
                    cases: {
                        "@operators": "operators",
                        "@default": ""
                    }
                }],
                // numbers
                [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
                [/0[xX][0-9a-fA-F]+/, "number.hex"],
                [/\d+/, "number"],
                // delimiter: after number because of .\d floats
                [/[;.]/, "delimiter"],
                // strings
                [/"/, { token: "string", next: "@string" }]
            ],
            comment: [
                [/[^/*]+/, "comment"],
                [/\/\*/, "comment", "@push"],
                [/\*\//, "comment", "@pop"],
                [/[/*]/, "comment"]
            ],
            string: [
                [/[^\\"$]+/, "string"],
                [/@escapes/, "string.escape"],
                [/\\./, "string.escape.invalid"],
                [/"/, "string", "@pop"]
            ],
            whitespace: [
                [/[ \t\r\n]+/, "white"],
                [/\/\*/, "comment", "@comment"],
                [/\/\/.*$/, "comment"]
            ]
        }
    } as any);
    const completionItemProvider: monaco.languages.CompletionItemProvider = {
        provideCompletionItems: () => {
            const suggestions: monaco.languages.CompletionItem[] = [];
            [...faustKeywords, ...faustFunctions, ...faustLib].forEach((e) => {
                suggestions.push({
                    label: e,
                    kind: monaco.languages.CompletionItemKind.Text,
                    insertText: e,
                    range: null
                });
            });
            return { suggestions };
        }
    };
    return { hoverProvider, tokensProvider, completionItemProvider, docs: libDocs };
};

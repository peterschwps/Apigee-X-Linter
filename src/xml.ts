import { parse, type DocumentCstNode, type ElementCstNode } from '@xml-tools/parser';

export type XmlAttribute = {
  name: string;
  value?: string;
  start: number;
  end: number;
  valueStart?: number;
  valueEnd?: number;
};

export type XmlNode = {
  name: string;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  startTagEnd?: number;
  endTagStart?: number;
  attributes: XmlAttribute[];
  children: XmlNode[];
};

export type SyntaxIssue = { message: string; start: number; end: number };
export type XmlDocument = { root?: XmlNode; syntaxIssues: SyntaxIssue[] };

function toNode(cst: ElementCstNode): XmlNode | undefined {
  const name = cst.children.Name?.[0];
  if (!name) return undefined;
  const open = cst.children.OPEN?.[0];
  const startClose = cst.children.START_CLOSE?.[0] || cst.children.SLASH_CLOSE?.[0];
  const endOpen = cst.children.SLASH_OPEN?.[0];
  const endToken = cst.children.END?.[0] || cst.children.SLASH_CLOSE?.[0] || startClose || name;
  const attributes: XmlAttribute[] = (cst.children.attribute || []).flatMap(attribute => {
    const key = attribute.children.Name?.[0];
    if (!key) return [];
    const raw = attribute.children.STRING?.[0];
    const quote = raw?.image[0];
    return [{
      name: key.image,
      value: raw && (quote === '"' || quote === "'") ? raw.image.slice(1, -1) : undefined,
      start: key.startOffset,
      end: (key.endOffset ?? key.startOffset) + 1,
      valueStart: raw ? raw.startOffset + 1 : undefined,
      valueEnd: raw ? raw.endOffset : undefined,
    }];
  });
  const children = (cst.children.content || [])
    .flatMap(content => content.children.element || [])
    .flatMap(child => {
      const parsed = toNode(child);
      return parsed ? [parsed] : [];
    });
  return {
    name: name.image,
    start: open?.startOffset ?? name.startOffset,
    end: (endToken.endOffset ?? endToken.startOffset) + 1,
    nameStart: name.startOffset,
    nameEnd: (name.endOffset ?? name.startOffset) + 1,
    startTagEnd: startClose ? (startClose.endOffset ?? startClose.startOffset) + 1 : undefined,
    endTagStart: endOpen?.startOffset,
    attributes,
    children,
  };
}

export function parseXml(text: string): XmlDocument {
  const result = parse(text);
  const document = result.cst as DocumentCstNode;
  const syntaxIssues: SyntaxIssue[] = [
    ...result.lexErrors.map(error => ({
      message: error.message,
      start: error.offset,
      end: error.offset + Math.max(error.length, 1),
    })),
    ...result.parseErrors.map(error => {
      const start = Number.isFinite(error.token.startOffset) ? error.token.startOffset : text.length;
      return { message: error.message, start, end: Math.min(start + 1, text.length) };
    }),
  ];
  const rootCst = document.children.element?.[0];
  return { root: rootCst ? toNode(rootCst) : undefined, syntaxIssues };
}

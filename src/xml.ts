import { parse, type ContentCstNode, type DocumentCstNode, type ElementCstNode } from '@xml-tools/parser';

type Token = ElementCstNode['children']['Name'][number];

export type XmlAttribute = {
  name: string;
  value?: string;
  start: number;
  end: number;
  valueStart?: number;
  valueEnd?: number;
};

export type XmlText = { value: string; start: number; end: number };

export type XmlNode = {
  name: string;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  /** Decoded, trimmed character data of a leaf element; comments are excluded. */
  text?: XmlText;
  attributes: XmlAttribute[];
  children: XmlNode[];
};

export type XmlComment = { text: string; start: number; end: number };
export type SyntaxIssue = { message: string; start: number; end: number };
export type XmlDocument = { root?: XmlNode; comments: XmlComment[]; syntaxIssues: SyntaxIssue[] };

const predefinedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodes predefined and numeric XML references; unknown references stay literal. */
export function decodeEntities(raw: string): string {
  return raw.replace(/&(?:#x([0-9A-Fa-f]+)|#([0-9]+)|([A-Za-z_][\w.-]*));/g, (reference, hex?: string, decimal?: string, name?: string) => {
    if (name) return predefinedEntities[name] ?? reference;
    const codePoint = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : reference;
  });
}

function tokenEnd(token: Token): number {
  return (token.endOffset ?? token.startOffset) + 1;
}

function leafText(content: ContentCstNode[]): XmlText | undefined {
  // Collect character data, CDATA, and references in document order.
  const pieces = content.flatMap(item => [
    ...(item.children.chardata || []).flatMap(data => [...(data.children.TEXT || []), ...(data.children.SEA_WS || [])])
      .map(token => ({ token, value: token.image })),
    ...(item.children.CData || []).map(token => ({ token, value: token.image.slice('<![CDATA['.length, -']]>'.length) })),
    ...(item.children.reference || []).flatMap(reference => [...(reference.children.EntityRef || []), ...(reference.children.CharRef || [])])
      .map(token => ({ token, value: decodeEntities(token.image) })),
  ]).sort((a, b) => a.token.startOffset - b.token.startOffset);
  const value = pieces.map(piece => piece.value).join('').trim();
  const meaningful = pieces.filter(piece => piece.value.trim());
  if (!value || !meaningful.length) return undefined;

  // Narrow the range to the non-whitespace part of the outer plain-text tokens.
  const first = meaningful[0].token;
  const last = meaningful[meaningful.length - 1].token;
  const start = first.tokenType.name === 'TEXT' ? first.startOffset + first.image.length - first.image.trimStart().length : first.startOffset;
  const end = last.tokenType.name === 'TEXT' ? last.startOffset + last.image.trimEnd().length : tokenEnd(last);
  return { value, start, end };
}

function toComment(token: Token): XmlComment {
  return { text: token.image.slice('<!--'.length, -'-->'.length), start: token.startOffset, end: tokenEnd(token) };
}

function toNode(cst: ElementCstNode, comments: XmlComment[]): XmlNode | undefined {
  const name = cst.children.Name?.[0];
  if (!name) return undefined;
  const open = cst.children.OPEN?.[0];
  const startClose = cst.children.START_CLOSE?.[0] || cst.children.SLASH_CLOSE?.[0];
  const endToken = cst.children.END?.[0] || cst.children.SLASH_CLOSE?.[0] || startClose || name;
  const attributes: XmlAttribute[] = (cst.children.attribute || []).flatMap(attribute => {
    const key = attribute.children.Name?.[0];
    if (!key) return [];
    const raw = attribute.children.STRING?.[0];
    const quote = raw?.image[0];
    return [{
      name: key.image,
      value: raw && (quote === '"' || quote === "'") ? decodeEntities(raw.image.slice(1, -1)) : undefined,
      start: key.startOffset,
      end: tokenEnd(key),
      valueStart: raw ? raw.startOffset + 1 : undefined,
      valueEnd: raw ? raw.endOffset : undefined,
    }];
  });
  const content = cst.children.content || [];
  comments.push(...content.flatMap(item => item.children.Comment || []).map(toComment));
  const children = content
    .flatMap(item => item.children.element || [])
    .flatMap(child => {
      const parsed = toNode(child, comments);
      return parsed ? [parsed] : [];
    });
  return {
    name: name.image,
    start: open?.startOffset ?? name.startOffset,
    end: tokenEnd(endToken),
    nameStart: name.startOffset,
    nameEnd: tokenEnd(name),
    text: children.length ? undefined : leafText(content),
    attributes,
    children,
  };
}

/** Returns the root element name, skipping a leading declaration, processing instructions, and comments. */
export function rootElementName(xml: string): string | undefined {
  return xml.match(/^\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->)\s*)*<([A-Za-z_][\w:.-]*)/)?.[1];
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
  const comments = (document.children.misc || []).flatMap(misc => misc.children.Comment || []).map(toComment);
  const rootCst = document.children.element?.[0];
  const root = rootCst ? toNode(rootCst, comments) : undefined;
  return { root, comments: comments.sort((a, b) => a.start - b.start), syntaxIssues };
}

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type ValueSpec = {
  kind: 'free' | 'enum' | 'format' | 'unknown';
  values?: string[];
  pattern?: string;
  format?: string;
  allowTemplate?: boolean;
};

export type AttributeSpec = ValueSpec & { required?: boolean; source?: string };

export type ElementSpec = {
  path: string;
  complete: boolean;
  source: string;
  attributes?: Record<string, AttributeSpec>;
  children?: string[];
  requiredChildren?: string[];
  text?: ValueSpec;
};

export type DocumentSpec = {
  kind: 'policy' | 'apiProxy' | 'proxyEndpoint' | 'targetEndpoint' | 'integrationEndpoint';
  root: string;
  source: string;
  reviewedAt: string;
  elements: ElementSpec[];
};

export function loadSpecifications(extensionPath: string): DocumentSpec[] {
  const directory = path.join(extensionPath, 'data', 'reviewed');
  return readdirSync(directory)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as DocumentSpec);
}

export function elementMap(document: DocumentSpec): Map<string, ElementSpec> {
  return new Map(document.elements.map(element => [element.path, element]));
}

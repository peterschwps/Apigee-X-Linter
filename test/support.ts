import path from 'node:path';
import { loadSpecifications } from '../src/spec';

export const repositoryRoot = path.resolve(__dirname, '..');
export const specs = loadSpecifications(repositoryRoot);
export const fixtureBundle = path.join(__dirname, 'fixtures', 'bundle', 'apiproxy');
export const policyFile = path.join(fixtureBundle, 'policies', 'Test.xml');
export const proxyFile = path.join(fixtureBundle, 'proxies', 'test.xml');
export const sharedFlowBundle = path.join(__dirname, 'fixtures', 'sharedflow', 'sharedflowbundle');
export const sharedFlowFile = path.join(sharedFlowBundle, 'sharedflows', 'test.xml');
export const sharedFlowManifest = path.join(sharedFlowBundle, 'test.xml');
export const sharedFlowPolicyFile = path.join(sharedFlowBundle, 'policies', 'Test.xml');

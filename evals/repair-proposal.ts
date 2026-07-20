import type { RepairChange, RepairProposal } from './types.js';

const proposalKeys = new Set(['changes', 'diagnosis']);
const changeKeys = new Set(['property', 'selector', 'value']);

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asNonBlankString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertNoUnexpectedKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string
): void {
  const unexpectedKeys = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new TypeError(`${label} contains unexpected fields: ${unexpectedKeys.join(', ')}`);
  }
}

function parseRepairChange(value: unknown, label: string): RepairChange {
  const record = asRecord(value, label);
  assertNoUnexpectedKeys(record, changeKeys, label);
  return {
    property: asNonBlankString(record.property, `${label}.property`),
    selector: asNonBlankString(record.selector, `${label}.selector`),
    value: asNonBlankString(record.value, `${label}.value`),
  };
}

export function parseRepairProposal(value: unknown, label: string): RepairProposal {
  const record = asRecord(value, label);
  assertNoUnexpectedKeys(record, proposalKeys, label);
  if (!Array.isArray(record.changes) || record.changes.length === 0) {
    throw new TypeError(`${label}.changes must be a non-empty array`);
  }
  if (record.changes.length > 20) {
    throw new RangeError(`${label}.changes must not exceed 20 entries`);
  }
  return {
    changes: record.changes.map((change, index) =>
      parseRepairChange(change, `${label}.changes[${index}]`)
    ),
    diagnosis: asNonBlankString(record.diagnosis, `${label}.diagnosis`),
  };
}

export function parseRepairProposalJson(content: string, label: string): RepairProposal {
  return parseRepairProposal(JSON.parse(content) as unknown, label);
}

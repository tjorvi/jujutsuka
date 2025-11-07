export const revsetPresets = {
  rootAncestors: {
    label: 'root()::',
    expression: 'root()::',
    summary: 'Everything reachable from the repository root',
  },
  mainAncestors: {
    label: 'main::',
    expression: 'main::',
    summary: 'Commits reachable from the main bookmark',
  },
} as const;

export type RevsetPresetName = keyof typeof revsetPresets;

export type RevsetSelection =
  | { kind: 'preset'; preset: RevsetPresetName }
  | { kind: 'custom' };

export const DEFAULT_CUSTOM_REVSET = revsetPresets.rootAncestors.expression;
export const DEFAULT_REVSET_SELECTION: RevsetSelection = { kind: 'preset', preset: 'rootAncestors' };

export function resolveRevsetExpression(selection: RevsetSelection, customExpression: string): string {
  if (selection.kind === 'preset') {
    return revsetPresets[selection.preset].expression;
  }
  return customExpression;
}
